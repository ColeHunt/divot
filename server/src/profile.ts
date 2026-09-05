import { getDb } from './db.js';
import { getUserById } from './users.js';
import { isFriend } from './friends.js';
import { scoresForRoundUser } from './scores.js';
import { toPar, totalStrokes } from '../../shared/src/scoring.js';
import type { FavoriteCourse, Hole, ProfileRound, ProfileStats, RoundFormat } from '../../shared/src/types.js';

export class ProfileError extends Error {
  constructor(
    readonly code: 'not_found' | 'not_friends',
    message: string,
  ) {
    super(message);
  }
}

const MAX_RECENT_ROUNDS = 5;

interface RoundRow {
  id: string;
  code: string;
  completed_at: number;
  format: string;
  course_id: string;
  course_name: string;
}

/**
 * A user's profile: aggregate stats across every course they've played, not
 * just one. Viewable by the user themself, or by a friend — anyone else gets
 * `not_friends`, same shape as the round-ownership checks elsewhere.
 */
export function getProfileStats(viewerId: string, targetUserId: string): ProfileStats {
  const target = getUserById(targetUserId);
  if (!target) throw new ProfileError('not_found', 'No such user');
  if (viewerId !== targetUserId && !isFriend(viewerId, targetUserId)) {
    throw new ProfileError('not_friends', "You can only view a friend's stats");
  }

  const db = getDb();
  const rows = db
    .prepare(
      `SELECT r.id, r.code, r.completed_at, r.format, r.course_id, c.name AS course_name
       FROM rounds r
       JOIN round_players p ON p.round_id = r.id
       JOIN courses c ON c.id = r.course_id
       WHERE p.user_id = ? AND r.status = 'completed'
       ORDER BY r.completed_at DESC`,
    )
    .all(targetUserId) as RoundRow[];

  if (rows.length === 0) {
    return { user: target, roundsPlayed: 0, favoriteCourse: null, bestRound: null, recentRounds: [] };
  }

  const holesByCourse = new Map<string, Hole[]>();
  function holesForCourse(courseId: string): Hole[] {
    let holes = holesByCourse.get(courseId);
    if (!holes) {
      holes = db
        .prepare('SELECT hole_number AS number, par, NULL AS yardage FROM course_holes WHERE course_id = ?')
        .all(courseId) as Hole[];
      holesByCourse.set(courseId, holes);
    }
    return holes;
  }

  const played = rows.map((row) => {
    const scores = scoresForRoundUser(row.id, targetUserId);
    const round: ProfileRound = {
      roundId: row.id,
      code: row.code,
      courseId: row.course_id,
      courseName: row.course_name,
      format: row.format as RoundFormat,
      playedAt: row.completed_at,
      totalStrokes: totalStrokes(scores),
      toPar: toPar(scores, holesForCourse(row.course_id)),
    };
    return { round, hasScores: Object.keys(scores).length > 0 };
  });

  const recentRounds = played.slice(0, MAX_RECENT_ROUNDS).map((p) => p.round);

  // A round with no strokes entered can't be anyone's "best" — excluded from
  // this comparison only, same as getCourseStats in courses.ts.
  const bestRound = played
    .filter((p) => p.hasScores)
    .reduce<ProfileRound | null>((best, p) => (!best || p.round.toPar < best.toPar ? p.round : best), null);

  const byCourse = new Map<string, { name: string; count: number; mostRecent: number }>();
  for (const row of rows) {
    const cur = byCourse.get(row.course_id) ?? { name: row.course_name, count: 0, mostRecent: 0 };
    cur.count += 1;
    cur.mostRecent = Math.max(cur.mostRecent, row.completed_at);
    byCourse.set(row.course_id, cur);
  }
  const [favoriteCourseId, favoriteCourseInfo] = [...byCourse.entries()].sort(
    ([, a], [, b]) => b.count - a.count || b.mostRecent - a.mostRecent,
  )[0]!;
  const favoriteCourse: FavoriteCourse = {
    courseId: favoriteCourseId,
    name: favoriteCourseInfo.name,
    roundsPlayed: favoriteCourseInfo.count,
  };

  return { user: target, roundsPlayed: rows.length, favoriteCourse, bestRound, recentRounds };
}
