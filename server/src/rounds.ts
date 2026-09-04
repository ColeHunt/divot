import { config } from './config.js';
import { getDb } from './db.js';
import { generateId, generateRoundCode } from './ids.js';
import { courseExists, getCourse } from './courses.js';
import { getUserById } from './users.js';
import { isFriend } from './friends.js';
import type { RoundInvite, RoundPlayer, RoundState, RoundSummary } from '../../shared/src/types.js';

export class RoundError extends Error {
  constructor(
    readonly code:
      | 'round_not_found'
      | 'not_a_player'
      | 'bad_request'
      | 'round_full'
      | 'round_completed'
      | 'not_your_round',
    message: string,
  ) {
    super(message);
  }
}

function touch(roundId: string): void {
  getDb().prepare('UPDATE rounds SET rev = rev + 1 WHERE id = ?').run(roundId);
}

/**
 * Starts a round on `courseId`. The creator is an immediate 'joined' player;
 * anyone in `inviteFriendIds` gets an 'invited' row they see on their home
 * screen. Inviting is a convenience on top of the round code, which still
 * works for anyone with the link — the same open-join trust one4one's rooms run on.
 */
export function createRound(
  creatorId: string,
  courseId: unknown,
  inviteFriendIds: unknown,
  now = Date.now(),
): { id: string; code: string } {
  if (typeof courseId !== 'string' || !courseExists(courseId)) {
    throw new RoundError('bad_request', 'Pick a course to start a round');
  }

  const invitees = uniqueIds(inviteFriendIds).filter(
    (id) => id !== creatorId && isFriend(creatorId, id),
  );
  if (invitees.length > config.maxPlayersPerRound - 1) {
    throw new RoundError('bad_request', 'Too many players for one round');
  }

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
    `INSERT INTO rounds (id, code, course_id, created_by, status, rev, started_at, completed_at)
     VALUES (?, ?, ?, ?, 'active', 0, ?, NULL)`,
  );
  const insertPlayer = db.prepare(
    `INSERT INTO round_players (round_id, user_id, status, invited_by, joined_at)
     VALUES (?, ?, ?, ?, ?)`,
  );

  db.transaction(() => {
    insertRound.run(id, code, courseId, creatorId, now);
    insertPlayer.run(id, creatorId, 'joined', null, now);
    for (const inviteeId of invitees) {
      insertPlayer.run(id, inviteeId, 'invited', creatorId, null);
    }
  })();

  return { id, code };
}

interface RoundRow {
  id: string;
  code: string;
  course_id: string;
  created_by: string;
  status: string;
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
  const course = getCourse(round.course_id);
  if (!course.holes.some((h) => h.number === holeNumber)) {
    throw new RoundError('bad_request', 'That hole is not on this course');
  }

  const db = getDb();
  if (strokes == null) {
    db.prepare('DELETE FROM round_scores WHERE round_id = ? AND user_id = ? AND hole_number = ?').run(
      round.id,
      userId,
      holeNumber,
    );
    touch(round.id);
    return;
  }

  const value = Number(strokes);
  if (!Number.isInteger(value) || value < MIN_STROKES || value > MAX_STROKES) {
    throw new RoundError('bad_request', 'Strokes must be between 1 and 20');
  }

  db.prepare(
    `INSERT INTO round_scores (round_id, user_id, hole_number, strokes, updated_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(round_id, user_id, hole_number) DO UPDATE SET strokes = excluded.strokes, updated_at = excluded.updated_at`,
  ).run(round.id, userId, holeNumber, value, now);
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
  const course = getCourse(round.course_id);

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
      scores: scoresFor(round.id, row.user_id),
    };
  });

  return {
    id: round.id,
    code: round.code,
    status: round.status as 'active' | 'completed',
    rev: round.rev,
    course,
    createdBy: round.created_by,
    startedAt: round.started_at,
    completedAt: round.completed_at,
    players,
  };
}

interface RoundListRow {
  id: string;
  code: string;
  status: string;
  course_id: string;
  course_name: string;
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
    courseName: row.course_name,
    courseId: row.course_id,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    playerNames: (namesStmt.all(row.id) as Array<{ name: string }>).map((r) => r.name),
  }));
}

const MAX_LIST = 25;

export function listMyRounds(userId: string): { active: RoundSummary[]; recent: RoundSummary[] } {
  const db = getDb();
  const base = `
    SELECT r.id, r.code, r.status, r.course_id, c.name AS course_name, r.started_at, r.completed_at
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
      `SELECT r.id, r.code, r.status, r.course_id, c.name AS course_name, r.started_at, r.completed_at, p.invited_by
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
