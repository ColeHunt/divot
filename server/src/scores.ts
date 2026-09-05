import { getDb } from './db.js';

function rowsToScores(rows: Array<{ hole_number: number; strokes: number }>): Record<number, number> {
  const scores: Record<number, number> = {};
  for (const row of rows) scores[row.hole_number] = row.strokes;
  return scores;
}

function rowsToPutts(rows: Array<{ hole_number: number; putts: number }>): Record<number, number> {
  const putts: Record<number, number> = {};
  for (const row of rows) putts[row.hole_number] = row.putts;
  return putts;
}

/**
 * A user's effective scorecard for a round, whatever its format. 'stroke_play'
 * reads their own round_scores; 'scramble' resolves their team and reads its
 * shared round_team_scores instead — empty if they were never on a team.
 *
 * Lives in its own module (not rounds.ts or courses.ts) because both of those
 * need it and importing across them would be circular.
 */
export function scoresForRoundUser(roundId: string, userId: string): Record<number, number> {
  const db = getDb();
  const round = db.prepare('SELECT format FROM rounds WHERE id = ?').get(roundId) as
    | { format: string }
    | undefined;
  if (!round) return {};

  if (round.format === 'scramble') {
    const team = db
      .prepare(
        `SELECT rtm.team_id AS team_id FROM round_team_members rtm
         JOIN round_teams rt ON rt.id = rtm.team_id
         WHERE rt.round_id = ? AND rtm.user_id = ?`,
      )
      .get(roundId, userId) as { team_id: string } | undefined;
    if (!team) return {};
    return rowsToScores(
      db
        .prepare('SELECT hole_number, strokes FROM round_team_scores WHERE team_id = ?')
        .all(team.team_id) as Array<{ hole_number: number; strokes: number }>,
    );
  }

  return rowsToScores(
    db
      .prepare('SELECT hole_number, strokes FROM round_scores WHERE round_id = ? AND user_id = ?')
      .all(roundId, userId) as Array<{ hole_number: number; strokes: number }>,
  );
}

/** Same resolution as scoresForRoundUser, but for the (optional) putt counts. */
export function puttsForRoundUser(roundId: string, userId: string): Record<number, number> {
  const db = getDb();
  const round = db.prepare('SELECT format FROM rounds WHERE id = ?').get(roundId) as
    | { format: string }
    | undefined;
  if (!round) return {};

  if (round.format === 'scramble') {
    const team = db
      .prepare(
        `SELECT rtm.team_id AS team_id FROM round_team_members rtm
         JOIN round_teams rt ON rt.id = rtm.team_id
         WHERE rt.round_id = ? AND rtm.user_id = ?`,
      )
      .get(roundId, userId) as { team_id: string } | undefined;
    if (!team) return {};
    return rowsToPutts(
      db
        .prepare('SELECT hole_number, putts FROM round_team_putts WHERE team_id = ?')
        .all(team.team_id) as Array<{ hole_number: number; putts: number }>,
    );
  }

  return rowsToPutts(
    db
      .prepare('SELECT hole_number, putts FROM round_putts WHERE round_id = ? AND user_id = ?')
      .all(roundId, userId) as Array<{ hole_number: number; putts: number }>,
  );
}
