import { config } from './config.js';
import { getDb } from './db.js';
import { generateId } from './ids.js';
import { scoresForRoundUser } from './scores.js';
import { totalStrokes, toPar } from '../../shared/src/scoring.js';
import type {
  Course,
  CourseStats,
  CourseSummary,
  Hole,
  HoleHistory,
  LastRound,
  SavedCourse,
} from '../../shared/src/types.js';

export class CourseError extends Error {
  constructor(readonly code: 'not_found' | 'bad_request' | 'has_rounds', message: string) {
    super(message);
  }
}

const MAX_NAME_LENGTH = 80;
const MAX_LOCATION_LENGTH = 80;

export interface NewHoleInput {
  number: number;
  par: number;
  yardage?: number | null;
}

function sanitiseHoles(input: unknown): Hole[] {
  if (!Array.isArray(input) || input.length === 0) {
    throw new CourseError('bad_request', 'A course needs at least one hole');
  }
  if (input.length > config.maxHolesPerCourse) {
    throw new CourseError('bad_request', 'Too many holes for one course');
  }

  const holes: Hole[] = [];
  const seen = new Set<number>();
  for (const raw of input as NewHoleInput[]) {
    const number = Number(raw?.number);
    const par = Number(raw?.par);
    if (!Number.isInteger(number) || number < 1 || number > config.maxHolesPerCourse) {
      throw new CourseError('bad_request', 'Bad hole number');
    }
    if (!Number.isInteger(par) || par < 3 || par > 6) {
      throw new CourseError('bad_request', 'Par must be between 3 and 6');
    }
    if (seen.has(number)) throw new CourseError('bad_request', 'Duplicate hole number');
    seen.add(number);
    const yardage = raw?.yardage == null ? null : Number(raw.yardage);
    holes.push({
      number,
      par,
      yardage: yardage != null && Number.isFinite(yardage) && yardage > 0 ? Math.round(yardage) : null,
    });
  }
  return holes.sort((a, b) => a.number - b.number);
}

function sanitiseName(name: unknown): string {
  const cleanName = typeof name === 'string' ? name.trim().slice(0, MAX_NAME_LENGTH) : '';
  if (!cleanName) throw new CourseError('bad_request', 'Enter a course name');
  return cleanName;
}

function sanitiseLocation(location: unknown): string | null {
  return typeof location === 'string' && location.trim()
    ? location.trim().slice(0, MAX_LOCATION_LENGTH)
    : null;
}

export function createCourse(
  createdBy: string,
  name: unknown,
  location: unknown,
  holesInput: unknown,
  now = Date.now(),
): Course {
  const cleanName = sanitiseName(name);
  const cleanLocation = sanitiseLocation(location);
  const holes = sanitiseHoles(holesInput);
  const id = generateId();
  const db = getDb();

  const insertCourse = db.prepare(
    'INSERT INTO courses (id, name, location, hole_count, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?)',
  );
  const insertHole = db.prepare(
    'INSERT INTO course_holes (course_id, hole_number, par, yardage) VALUES (?, ?, ?, ?)',
  );

  db.transaction(() => {
    insertCourse.run(id, cleanName, cleanLocation, holes.length, createdBy, now);
    for (const hole of holes) insertHole.run(id, hole.number, hole.par, hole.yardage);
  })();

  return { id, name: cleanName, location: cleanLocation, holeCount: holes.length, holes, createdAt: now };
}

interface CourseRow {
  id: string;
  name: string;
  location: string | null;
  hole_count: number;
  created_at: number;
}

interface HoleRow {
  hole_number: number;
  par: number;
  yardage: number | null;
}

function holesFor(courseId: string): Hole[] {
  const rows = getDb()
    .prepare('SELECT hole_number, par, yardage FROM course_holes WHERE course_id = ? ORDER BY hole_number ASC')
    .all(courseId) as HoleRow[];
  return rows.map((row) => ({ number: row.hole_number, par: row.par, yardage: row.yardage }));
}

export function getCourse(id: string): Course {
  const row = getDb().prepare('SELECT * FROM courses WHERE id = ?').get(id) as CourseRow | undefined;
  if (!row) throw new CourseError('not_found', 'No such course');
  return {
    id: row.id,
    name: row.name,
    location: row.location,
    holeCount: row.hole_count,
    holes: holesFor(row.id),
    createdAt: row.created_at,
  };
}

export function courseExists(id: string): boolean {
  return Boolean(getDb().prepare('SELECT id FROM courses WHERE id = ?').get(id));
}

/** Admin-only (enforced by the route, not here) — replaces a course's name, location and full hole list. */
export function updateCourse(id: string, name: unknown, location: unknown, holesInput: unknown): Course {
  if (!courseExists(id)) throw new CourseError('not_found', 'No such course');

  const cleanName = sanitiseName(name);
  const cleanLocation = sanitiseLocation(location);
  const holes = sanitiseHoles(holesInput);
  const db = getDb();

  db.transaction(() => {
    db.prepare('UPDATE courses SET name = ?, location = ?, hole_count = ? WHERE id = ?').run(
      cleanName,
      cleanLocation,
      holes.length,
      id,
    );
    db.prepare('DELETE FROM course_holes WHERE course_id = ?').run(id);
    const insertHole = db.prepare(
      'INSERT INTO course_holes (course_id, hole_number, par, yardage) VALUES (?, ?, ?, ?)',
    );
    for (const hole of holes) insertHole.run(id, hole.number, hole.par, hole.yardage);
  })();

  return getCourse(id);
}

/**
 * Admin-only (enforced by the route). Fails with 'has_rounds' rather than
 * deleting anything if a round was ever played here — rounds.course_id is
 * ON DELETE RESTRICT on purpose, so round history can never be silently
 * destroyed by removing the course it was played on.
 */
export function deleteCourse(id: string): void {
  if (!courseExists(id)) throw new CourseError('not_found', 'No such course');
  try {
    getDb().prepare('DELETE FROM courses WHERE id = ?').run(id);
  } catch (error) {
    if (error instanceof Error && /FOREIGN KEY constraint failed/i.test(error.message)) {
      throw new CourseError('has_rounds', 'This course has rounds played on it and cannot be deleted');
    }
    throw error;
  }
}

const MAX_SEARCH_RESULTS = 25;

export function searchCourses(query: string): CourseSummary[] {
  const db = getDb();
  const cleaned = query.trim();
  const rows = cleaned
    ? (db
        .prepare(
          `SELECT id, name, location, hole_count FROM courses
           WHERE name LIKE ? ESCAPE '\\' OR location LIKE ? ESCAPE '\\'
           ORDER BY name ASC LIMIT ?`,
        )
        .all(
          `%${cleaned.replace(/[%_]/g, (c) => `\\${c}`)}%`,
          `%${cleaned.replace(/[%_]/g, (c) => `\\${c}`)}%`,
          MAX_SEARCH_RESULTS,
        ) as Array<{ id: string; name: string; location: string | null; hole_count: number }>)
    : (db
        .prepare('SELECT id, name, location, hole_count FROM courses ORDER BY name ASC LIMIT ?')
        .all(MAX_SEARCH_RESULTS) as Array<{ id: string; name: string; location: string | null; hole_count: number }>);
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    location: row.location,
    holeCount: row.hole_count,
  }));
}

export function saveCourse(userId: string, courseId: string, now = Date.now()): void {
  if (!courseExists(courseId)) throw new CourseError('not_found', 'No such course');
  getDb()
    .prepare(
      `INSERT INTO user_saved_courses (user_id, course_id, saved_at) VALUES (?, ?, ?)
       ON CONFLICT(user_id, course_id) DO NOTHING`,
    )
    .run(userId, courseId, now);
}

export function unsaveCourse(userId: string, courseId: string): void {
  getDb()
    .prepare('DELETE FROM user_saved_courses WHERE user_id = ? AND course_id = ?')
    .run(userId, courseId);
}

export function listSavedCourses(userId: string): SavedCourse[] {
  const rows = getDb()
    .prepare(
      `SELECT c.id, c.name, c.location, c.hole_count, s.saved_at
       FROM user_saved_courses s
       JOIN courses c ON c.id = s.course_id
       WHERE s.user_id = ?
       ORDER BY s.saved_at DESC`,
    )
    .all(userId) as Array<{
    id: string;
    name: string;
    location: string | null;
    hole_count: number;
    saved_at: number;
  }>;
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    location: row.location,
    holeCount: row.hole_count,
    savedAt: row.saved_at,
    lastPlayed: getLastRound(userId, row.id),
  }));
}

export function isSaved(userId: string, courseId: string): boolean {
  return Boolean(
    getDb()
      .prepare('SELECT 1 FROM user_saved_courses WHERE user_id = ? AND course_id = ?')
      .get(userId, courseId),
  );
}

interface RoundRow {
  id: string;
  code: string;
  completed_at: number;
}

/**
 * The most recent round a user completed on a course, with their scorecard.
 * Null if never played. Works the same for a 'scramble' round as a
 * 'stroke_play' one — scoresForRoundUser resolves the user's own card either
 * way, individual or via their team.
 */
export function getLastRound(userId: string, courseId: string): LastRound | null {
  const db = getDb();
  const round = db
    .prepare(
      `SELECT r.id, r.code, r.completed_at
       FROM rounds r
       JOIN round_players p ON p.round_id = r.id
       WHERE r.course_id = ? AND p.user_id = ? AND r.status = 'completed'
       ORDER BY r.completed_at DESC LIMIT 1`,
    )
    .get(courseId, userId) as RoundRow | undefined;
  if (!round) return null;

  const scores = scoresForRoundUser(round.id, userId);
  const holes = holesFor(courseId);
  return {
    roundId: round.id,
    code: round.code,
    playedAt: round.completed_at,
    totalStrokes: totalStrokes(scores),
    toPar: toPar(scores, holes),
    scores,
  };
}

/**
 * Every one of a user's completed rounds on a course, reduced to their best
 * (lowest total strokes, ties broken toward the more recent one — 'reduce'
 * only replaces on a strict improvement) and most recent. A round with no
 * strokes entered at all can't be anyone's "best", so it's excluded from
 * that half only; the most recent round still surfaces even if unscored.
 */
export function getCourseStats(userId: string, courseId: string): CourseStats {
  const db = getDb();
  const rounds = db
    .prepare(
      `SELECT r.id, r.code, r.completed_at
       FROM rounds r
       JOIN round_players p ON p.round_id = r.id
       WHERE r.course_id = ? AND p.user_id = ? AND r.status = 'completed'
       ORDER BY r.completed_at DESC`,
    )
    .all(courseId, userId) as RoundRow[];

  if (rounds.length === 0) return { roundsPlayed: 0, bestRound: null, lastRound: null };

  const holes = holesFor(courseId);
  const stats: LastRound[] = rounds.map((round) => {
    const scores = scoresForRoundUser(round.id, userId);
    return {
      roundId: round.id,
      code: round.code,
      playedAt: round.completed_at,
      totalStrokes: totalStrokes(scores),
      toPar: toPar(scores, holes),
      scores,
    };
  });

  const lastRound = stats[0]!;
  const bestRound = stats
    .filter((s) => Object.keys(s.scores).length > 0)
    .reduce<LastRound | null>((best, s) => (!best || s.totalStrokes < best.totalStrokes ? s : best), null);

  return { roundsPlayed: stats.length, bestRound, lastRound };
}

const MAX_ROUNDS_FOR_HOLE_HISTORY = 20;
const MAX_HISTORY_PER_HOLE = 5;

/**
 * A user's past strokes on each hole of a course, most recent round first
 * and capped per hole — a quick "how have I done here before" while scoring
 * that hole live. `excludeRoundId` leaves out the round being played right
 * now, so it never shows a score back to the person who just entered it.
 *
 * Split into `personal` (stroke_play — genuinely their own play) and
 * `scramble` (a shared team result) buckets, each capped independently, so
 * a team's best-ball score never gets averaged in with the player's own.
 */
export function getHoleHistory(
  userId: string,
  courseId: string,
  excludeRoundId?: string,
): Record<number, HoleHistory> {
  const db = getDb();
  const rounds = db
    .prepare(
      `SELECT r.id, r.format, r.completed_at
       FROM rounds r
       JOIN round_players p ON p.round_id = r.id
       WHERE r.course_id = ? AND p.user_id = ? AND r.status = 'completed' AND r.id != ?
       ORDER BY r.completed_at DESC LIMIT ?`,
    )
    .all(courseId, userId, excludeRoundId ?? '', MAX_ROUNDS_FOR_HOLE_HISTORY) as Array<{
    id: string;
    format: string;
    completed_at: number;
  }>;

  const history: Record<number, HoleHistory> = {};
  for (const round of rounds) {
    const scores = scoresForRoundUser(round.id, userId);
    const bucket = round.format === 'scramble' ? 'scramble' : 'personal';
    for (const [holeNumberStr, strokes] of Object.entries(scores)) {
      const holeNumber = Number(holeNumberStr);
      const forHole = (history[holeNumber] ??= { personal: [], scramble: [] });
      if (forHole[bucket].length < MAX_HISTORY_PER_HOLE) forHole[bucket].push(strokes);
    }
  }
  return history;
}
