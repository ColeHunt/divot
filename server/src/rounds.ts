import { config } from './config.js';
import { getDb } from './db.js';
import { generateId, generateRoundCode } from './ids.js';
import { courseExists, getCourse } from './courses.js';
import { getUserById } from './users.js';
import { isFriend } from './friends.js';
import type {
  Course,
  RoundFormat,
  RoundInvite,
  RoundPlayer,
  RoundState,
  RoundSummary,
  RoundTeam,
} from '../../shared/src/types.js';

export class RoundError extends Error {
  constructor(
    readonly code:
      | 'round_not_found'
      | 'not_a_player'
      | 'bad_request'
      | 'round_full'
      | 'round_completed'
      | 'not_your_round'
      | 'not_on_a_team'
      | 'team_not_found',
    message: string,
  ) {
    super(message);
  }
}

function touch(roundId: string): void {
  getDb().prepare('UPDATE rounds SET rev = rev + 1 WHERE id = ?').run(roundId);
}

function sanitiseTeamName(input: unknown): string {
  const name = typeof input === 'string' ? input.replace(/\s+/g, ' ').trim() : '';
  return name.slice(0, config.maxTeamNameLength);
}

interface ResolvedTeam {
  name: string;
  memberIds: string[];
}

/**
 * Turns creation-time team input into a validated team list. Members not
 * named on any team are simply left off a team — they can create or join one
 * themselves once they're in the round. With no usable input at all, everyone
 * eligible (creator + invitees) lands on one default team, the "just start a
 * scramble with whoever I invited" path.
 */
function resolveTeams(creatorId: string, invitees: string[], teamsInput: unknown): ResolvedTeam[] {
  const eligible = new Set([creatorId, ...invitees]);

  if (!Array.isArray(teamsInput) || teamsInput.length === 0) {
    return [{ name: 'Team 1', memberIds: [...eligible] }];
  }

  const claimed = new Set<string>();
  const teams: ResolvedTeam[] = [];
  let index = 0;
  for (const raw of teamsInput as Array<{ name?: unknown; memberIds?: unknown }>) {
    index += 1;
    const memberIds = uniqueIds(raw?.memberIds).filter((id) => eligible.has(id) && !claimed.has(id));
    if (memberIds.length === 0) continue;
    for (const id of memberIds) claimed.add(id);
    teams.push({ name: sanitiseTeamName(raw?.name) || `Team ${index}`, memberIds });
  }

  if (teams.length === 0) return [{ name: 'Team 1', memberIds: [...eligible] }];
  if (teams.length > config.maxTeamsPerRound) {
    throw new RoundError('bad_request', 'Too many teams for one round');
  }
  return teams;
}

/**
 * Resolves a creation-time hole selection ('front9' | 'back9' | 'full', or
 * anything else/omitted) against the actual course. Front/back only apply
 * to an 18+ hole course — split evenly by sorted hole number, not assumed to
 * be numbered exactly 1-18 — anything else always plays the whole course.
 */
function resolveHoleSelection(course: Course, selection: unknown): number[] {
  const sorted = [...course.holes].map((h) => h.number).sort((a, b) => a - b);
  if (selection === 'front9' && sorted.length >= 18) return sorted.slice(0, 9);
  if (selection === 'back9' && sorted.length >= 18) return sorted.slice(-9);
  return sorted;
}

/** The holes actually being played in a round, falling back to the whole course for a round created before round_holes existed. */
function roundHoleNumbers(roundId: string, courseId: string): number[] {
  const rows = getDb()
    .prepare('SELECT hole_number FROM round_holes WHERE round_id = ? ORDER BY hole_number ASC')
    .all(roundId) as Array<{ hole_number: number }>;
  if (rows.length > 0) return rows.map((r) => r.hole_number);
  return getCourse(courseId)
    .holes.map((h) => h.number)
    .sort((a, b) => a - b);
}

function computeHolesLabel(playedNumbers: number[], courseHoleCount: number): string | null {
  if (playedNumbers.length === 0 || playedNumbers.length === courseHoleCount) return null;
  const sorted = [...playedNumbers].sort((a, b) => a - b);
  if (sorted.length === 9 && sorted[0] === 1) return 'Front 9';
  if (sorted.length === 9 && sorted[sorted.length - 1] === courseHoleCount) return 'Back 9';
  return `${sorted.length} holes`;
}

/**
 * Starts a round on `courseId`. The creator is an immediate 'joined' player;
 * anyone in `inviteFriendIds` gets an 'invited' row they see on their home
 * screen. Inviting is a convenience on top of the round code, which still
 * works for anyone with the link — the same open-join trust one4one's rooms run on.
 *
 * `format` defaults to 'stroke_play'. For 'scramble', `teams` optionally
 * groups the creator and invitees into teams up front; anyone left off a team
 * (including a player who joins later via the code) can create or join one
 * once they're in the round.
 */
export function createRound(
  creatorId: string,
  input: unknown,
  now = Date.now(),
): { id: string; code: string } {
  const body = (input ?? {}) as {
    courseId?: unknown;
    inviteFriendIds?: unknown;
    format?: unknown;
    teams?: unknown;
    holesSelection?: unknown;
  };

  if (typeof body.courseId !== 'string' || !courseExists(body.courseId)) {
    throw new RoundError('bad_request', 'Pick a course to start a round');
  }
  const courseId = body.courseId;
  const holeNumbers = resolveHoleSelection(getCourse(courseId), body.holesSelection);

  const invitees = uniqueIds(body.inviteFriendIds).filter(
    (id) => id !== creatorId && isFriend(creatorId, id),
  );
  if (invitees.length > config.maxPlayersPerRound - 1) {
    throw new RoundError('bad_request', 'Too many players for one round');
  }

  const format: RoundFormat = body.format === 'scramble' ? 'scramble' : 'stroke_play';
  const teams = format === 'scramble' ? resolveTeams(creatorId, invitees, body.teams) : [];

  const db = getDb();
  const id = generateId();
  let code = '';
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const candidate = generateRoundCode();
    if (!db.prepare('SELECT code FROM rounds WHERE code = ?').get(candidate)) {
      code = candidate;
      break;
    }
  }
  if (!code) throw new RoundError('bad_request', 'Could not allocate a round code');

  const insertRound = db.prepare(
    `INSERT INTO rounds (id, code, course_id, created_by, status, format, rev, started_at, completed_at)
     VALUES (?, ?, ?, ?, 'active', ?, 0, ?, NULL)`,
  );
  const insertPlayer = db.prepare(
    `INSERT INTO round_players (round_id, user_id, status, invited_by, joined_at)
     VALUES (?, ?, ?, ?, ?)`,
  );
  const insertTeam = db.prepare('INSERT INTO round_teams (id, round_id, name, position) VALUES (?, ?, ?, ?)');
  const insertTeamMember = db.prepare('INSERT INTO round_team_members (team_id, user_id) VALUES (?, ?)');
  const insertHole = db.prepare('INSERT INTO round_holes (round_id, hole_number) VALUES (?, ?)');

  db.transaction(() => {
    insertRound.run(id, code, courseId, creatorId, format, now);
    insertPlayer.run(id, creatorId, 'joined', null, now);
    for (const inviteeId of invitees) {
      insertPlayer.run(id, inviteeId, 'invited', creatorId, null);
    }
    for (const holeNumber of holeNumbers) insertHole.run(id, holeNumber);
    teams.forEach((team, position) => {
      const teamId = generateId();
      insertTeam.run(teamId, id, team.name, position);
      for (const memberId of team.memberIds) insertTeamMember.run(teamId, memberId);
    });
  })();

  return { id, code };
}

interface RoundRow {
  id: string;
  code: string;
  course_id: string;
  created_by: string;
  status: string;
  format: string;
  rev: number;
  started_at: number;
  completed_at: number | null;
}

function loadRound(code: string): RoundRow {
  const row = getDb().prepare('SELECT * FROM rounds WHERE code = ?').get(code) as
    | RoundRow
    | undefined;
  if (!row) throw new RoundError('round_not_found', 'No round with that code');
  return row;
}

export function roundExists(code: string): boolean {
  return Boolean(getDb().prepare('SELECT id FROM rounds WHERE code = ?').get(code));
}

interface PlayerRow {
  user_id: string;
  status: string;
  joined_at: number | null;
}

function requirePlayer(roundId: string, userId: string): PlayerRow {
  const row = getDb()
    .prepare('SELECT user_id, status, joined_at FROM round_players WHERE round_id = ? AND user_id = ?')
    .get(roundId, userId) as PlayerRow | undefined;
  if (!row || row.status !== 'joined') {
    throw new RoundError('not_a_player', 'Join the round first');
  }
  return row;
}

function requireOpen(status: string): void {
  if (status === 'completed') {
    throw new RoundError('round_completed', 'This round is finished');
  }
}

function requireScramble(format: string): void {
  if (format !== 'scramble') {
    throw new RoundError('bad_request', 'Teams are only for scramble rounds');
  }
}

/**
 * Joins a round as `userId` — from an 'invited' row, or fresh via the round
 * code (the open-join path anyone with the code can take). Idempotent.
 */
export function joinRound(code: string, userId: string, now = Date.now()): void {
  const round = loadRound(code);
  requireOpen(round.status);
  const db = getDb();

  const existing = db
    .prepare('SELECT status FROM round_players WHERE round_id = ? AND user_id = ?')
    .get(round.id, userId) as { status: string } | undefined;

  if (existing) {
    if (existing.status === 'joined') return;
    db.prepare(
      'UPDATE round_players SET status = ?, joined_at = ? WHERE round_id = ? AND user_id = ?',
    ).run('joined', now, round.id, userId);
    touch(round.id);
    return;
  }

  const count = (
    db.prepare('SELECT COUNT(*) AS n FROM round_players WHERE round_id = ?').get(round.id) as {
      n: number;
    }
  ).n;
  if (count >= config.maxPlayersPerRound) throw new RoundError('round_full', 'This round is full');

  db.prepare(
    `INSERT INTO round_players (round_id, user_id, status, invited_by, joined_at)
     VALUES (?, ?, 'joined', NULL, ?)`,
  ).run(round.id, userId, now);
  touch(round.id);
}

/** Declines or leaves an invite before joining. Removing an active player is not supported. */
export function declineRound(code: string, userId: string): void {
  const round = loadRound(code);
  getDb()
    .prepare(
      "DELETE FROM round_players WHERE round_id = ? AND user_id = ? AND status = 'invited'",
    )
    .run(round.id, userId);
}

// ---- scramble teams ----

function findUserTeamId(roundId: string, userId: string): string | null {
  const row = getDb()
    .prepare(
      `SELECT rtm.team_id AS team_id FROM round_team_members rtm
       JOIN round_teams rt ON rt.id = rtm.team_id
       WHERE rt.round_id = ? AND rtm.user_id = ?`,
    )
    .get(roundId, userId) as { team_id: string } | undefined;
  return row?.team_id ?? null;
}

/** Removes `userId` from whichever team they're on in this round, if any. An emptied team is deleted. */
function leaveCurrentTeam(roundId: string, userId: string): void {
  const teamId = findUserTeamId(roundId, userId);
  if (!teamId) return;
  const db = getDb();
  db.prepare('DELETE FROM round_team_members WHERE team_id = ? AND user_id = ?').run(teamId, userId);
  const remaining = (
    db.prepare('SELECT COUNT(*) AS n FROM round_team_members WHERE team_id = ?').get(teamId) as {
      n: number;
    }
  ).n;
  if (remaining === 0) db.prepare('DELETE FROM round_teams WHERE id = ?').run(teamId);
}

/** Creates a new team in a scramble round and puts the caller on it, leaving any prior team. */
export function createTeam(code: string, userId: string, name: unknown): string {
  const round = loadRound(code);
  requirePlayer(round.id, userId);
  requireScramble(round.format);
  requireOpen(round.status);

  const db = getDb();
  const position = (
    db.prepare('SELECT COUNT(*) AS n FROM round_teams WHERE round_id = ?').get(round.id) as {
      n: number;
    }
  ).n;
  if (position >= config.maxTeamsPerRound) throw new RoundError('bad_request', 'Too many teams for one round');

  const teamId = generateId();
  db.transaction(() => {
    leaveCurrentTeam(round.id, userId);
    db.prepare('INSERT INTO round_teams (id, round_id, name, position) VALUES (?, ?, ?, ?)').run(
      teamId,
      round.id,
      sanitiseTeamName(name) || `Team ${position + 1}`,
      position,
    );
    db.prepare('INSERT INTO round_team_members (team_id, user_id) VALUES (?, ?)').run(teamId, userId);
  })();
  touch(round.id);
  return teamId;
}

/** Joins an existing team, leaving whichever team the caller was previously on. */
export function joinTeam(code: string, userId: string, teamId: string): void {
  const round = loadRound(code);
  requirePlayer(round.id, userId);
  requireScramble(round.format);
  requireOpen(round.status);

  const team = getDb()
    .prepare('SELECT id FROM round_teams WHERE id = ? AND round_id = ?')
    .get(teamId, round.id);
  if (!team) throw new RoundError('team_not_found', 'No such team in this round');

  if (findUserTeamId(round.id, userId) === teamId) return;

  const db = getDb();
  db.transaction(() => {
    leaveCurrentTeam(round.id, userId);
    db.prepare(
      `INSERT INTO round_team_members (team_id, user_id) VALUES (?, ?)
       ON CONFLICT(team_id, user_id) DO NOTHING`,
    ).run(teamId, userId);
  })();
  touch(round.id);
}

/** Leaves the caller's current team, if any. Idempotent. */
export function leaveTeam(code: string, userId: string): void {
  const round = loadRound(code);
  requirePlayer(round.id, userId);
  requireScramble(round.format);
  leaveCurrentTeam(round.id, userId);
  touch(round.id);
}

/** Renames a team. Any joined player in the round can — teams have no separate "captain" concept. */
export function renameTeam(code: string, userId: string, teamId: string, name: unknown): void {
  const round = loadRound(code);
  requirePlayer(round.id, userId);
  requireScramble(round.format);

  const cleanName = sanitiseTeamName(name);
  if (!cleanName) throw new RoundError('bad_request', 'Enter a team name');

  const result = getDb()
    .prepare('UPDATE round_teams SET name = ? WHERE id = ? AND round_id = ?')
    .run(cleanName, teamId, round.id);
  if (result.changes === 0) throw new RoundError('team_not_found', 'No such team in this round');
  touch(round.id);
}

// ---- scoring ----

const MIN_STROKES = 1;
const MAX_STROKES = 20;

export function setScore(
  code: string,
  userId: string,
  hole: unknown,
  strokes: unknown,
  now = Date.now(),
): void {
  const round = loadRound(code);
  requirePlayer(round.id, userId);
  requireOpen(round.status);

  const holeNumber = Number(hole);
  if (!roundHoleNumbers(round.id, round.course_id).includes(holeNumber)) {
    throw new RoundError('bad_request', 'That hole is not part of this round');
  }

  const value = strokes == null ? null : Number(strokes);
  if (value != null && (!Number.isInteger(value) || value < MIN_STROKES || value > MAX_STROKES)) {
    throw new RoundError('bad_request', 'Strokes must be between 1 and 20');
  }

  const db = getDb();

  if (round.format === 'scramble') {
    const teamId = findUserTeamId(round.id, userId);
    if (!teamId) throw new RoundError('not_on_a_team', 'Join a team first');

    if (value == null) {
      db.prepare('DELETE FROM round_team_scores WHERE team_id = ? AND hole_number = ?').run(teamId, holeNumber);
    } else {
      db.prepare(
        `INSERT INTO round_team_scores (round_id, team_id, hole_number, strokes, updated_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(team_id, hole_number) DO UPDATE SET strokes = excluded.strokes, updated_at = excluded.updated_at`,
      ).run(round.id, teamId, holeNumber, value, now);
    }
    touch(round.id);
    return;
  }

  if (value == null) {
    db.prepare('DELETE FROM round_scores WHERE round_id = ? AND user_id = ? AND hole_number = ?').run(
      round.id,
      userId,
      holeNumber,
    );
  } else {
    db.prepare(
      `INSERT INTO round_scores (round_id, user_id, hole_number, strokes, updated_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(round_id, user_id, hole_number) DO UPDATE SET strokes = excluded.strokes, updated_at = excluded.updated_at`,
    ).run(round.id, userId, holeNumber, value, now);
  }
  touch(round.id);
}

export function completeRound(code: string, userId: string, now = Date.now()): void {
  const round = loadRound(code);
  requirePlayer(round.id, userId);
  if (round.status === 'completed') return;
  getDb().prepare("UPDATE rounds SET status = 'completed', completed_at = ? WHERE id = ?").run(now, round.id);
  touch(round.id);
}

/** Reopens a completed round for further scoring. Any player can, the same as closing. */
export function reopenRound(code: string, userId: string, now = Date.now()): void {
  const round = loadRound(code);
  requirePlayer(round.id, userId);
  getDb().prepare("UPDATE rounds SET status = 'active', completed_at = NULL WHERE id = ?").run(round.id);
  touch(round.id);
}

function teamsForRound(roundId: string): RoundTeam[] {
  const db = getDb();
  const teamRows = db
    .prepare('SELECT id, name FROM round_teams WHERE round_id = ? ORDER BY position ASC')
    .all(roundId) as Array<{ id: string; name: string }>;

  const membersStmt = db.prepare('SELECT user_id FROM round_team_members WHERE team_id = ?');
  const scoresStmt = db.prepare('SELECT hole_number, strokes FROM round_team_scores WHERE team_id = ?');

  return teamRows.map((team) => {
    const scores: Record<number, number> = {};
    for (const row of scoresStmt.all(team.id) as Array<{ hole_number: number; strokes: number }>) {
      scores[row.hole_number] = row.strokes;
    }
    return {
      id: team.id,
      name: team.name,
      memberUserIds: (membersStmt.all(team.id) as Array<{ user_id: string }>).map((r) => r.user_id),
      scores,
    };
  });
}

function scoresFor(roundId: string, userId: string): Record<number, number> {
  const rows = getDb()
    .prepare('SELECT hole_number, strokes FROM round_scores WHERE round_id = ? AND user_id = ?')
    .all(roundId, userId) as Array<{ hole_number: number; strokes: number }>;
  const scores: Record<number, number> = {};
  for (const row of rows) scores[row.hole_number] = row.strokes;
  return scores;
}

export function getRoundState(code: string): RoundState {
  const round = loadRound(code);
  const fullCourse = getCourse(round.course_id);
  const playedNumbers = new Set(roundHoleNumbers(round.id, round.course_id));
  const playedHoles = fullCourse.holes.filter((h) => playedNumbers.has(h.number));
  const course: Course = { ...fullCourse, holes: playedHoles, holeCount: playedHoles.length };
  const holesLabel = computeHolesLabel(playedHoles.map((h) => h.number), fullCourse.holeCount);
  const format = round.format as RoundFormat;

  const playerRows = getDb()
    .prepare('SELECT user_id, status, joined_at FROM round_players WHERE round_id = ? ORDER BY joined_at ASC')
    .all(round.id) as PlayerRow[];

  const players: RoundPlayer[] = playerRows.map((row) => {
    const user = getUserById(row.user_id);
    return {
      userId: row.user_id,
      name: user?.name ?? 'Unknown',
      status: row.status as 'invited' | 'joined',
      joinedAt: row.joined_at,
      scores: format === 'stroke_play' ? scoresFor(round.id, row.user_id) : {},
    };
  });

  return {
    id: round.id,
    code: round.code,
    status: round.status as 'active' | 'completed',
    format,
    rev: round.rev,
    course,
    holesLabel,
    createdBy: round.created_by,
    startedAt: round.started_at,
    completedAt: round.completed_at,
    players,
    teams: format === 'scramble' ? teamsForRound(round.id) : [],
  };
}

interface RoundListRow {
  id: string;
  code: string;
  status: string;
  format: string;
  course_id: string;
  course_name: string;
  course_hole_count: number;
  started_at: number;
  completed_at: number | null;
}

function toSummaries(rows: RoundListRow[]): RoundSummary[] {
  const db = getDb();
  const namesStmt = db.prepare(
    `SELECT u.name FROM round_players p JOIN users u ON u.id = p.user_id
     WHERE p.round_id = ? AND p.status = 'joined' ORDER BY p.joined_at ASC`,
  );
  return rows.map((row) => ({
    id: row.id,
    code: row.code,
    status: row.status as 'active' | 'completed',
    format: row.format as RoundFormat,
    courseName: row.course_name,
    courseId: row.course_id,
    holesLabel: computeHolesLabel(roundHoleNumbers(row.id, row.course_id), row.course_hole_count),
    startedAt: row.started_at,
    completedAt: row.completed_at,
    playerNames: (namesStmt.all(row.id) as Array<{ name: string }>).map((r) => r.name),
  }));
}

const MAX_LIST = 25;

export function listMyRounds(userId: string): { active: RoundSummary[]; recent: RoundSummary[] } {
  const db = getDb();
  const base = `
    SELECT r.id, r.code, r.status, r.format, r.course_id, c.name AS course_name, c.hole_count AS course_hole_count, r.started_at, r.completed_at
    FROM rounds r
    JOIN round_players p ON p.round_id = r.id
    JOIN courses c ON c.id = r.course_id
    WHERE p.user_id = ? AND p.status = 'joined'
  `;
  const active = db
    .prepare(`${base} AND r.status = 'active' ORDER BY r.started_at DESC LIMIT ?`)
    .all(userId, MAX_LIST) as RoundListRow[];
  const recent = db
    .prepare(`${base} AND r.status = 'completed' ORDER BY r.completed_at DESC LIMIT ?`)
    .all(userId, MAX_LIST) as RoundListRow[];
  return { active: toSummaries(active), recent: toSummaries(recent) };
}

export function listMyInvites(userId: string): RoundInvite[] {
  const rows = getDb()
    .prepare(
      `SELECT r.id, r.code, r.status, r.format, r.course_id, c.name AS course_name, c.hole_count AS course_hole_count, r.started_at, r.completed_at, p.invited_by
       FROM round_players p
       JOIN rounds r ON r.id = p.round_id
       JOIN courses c ON c.id = r.course_id
       WHERE p.user_id = ? AND p.status = 'invited' AND r.status = 'active'
       ORDER BY r.started_at DESC`,
    )
    .all(userId) as Array<RoundListRow & { invited_by: string | null }>;

  const summaries = toSummaries(rows);
  return rows.map((row, i) => ({ round: summaries[i]!, invitedBy: row.invited_by }));
}

function uniqueIds(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  for (const value of input) {
    if (typeof value === 'string') seen.add(value);
  }
  return [...seen];
}
