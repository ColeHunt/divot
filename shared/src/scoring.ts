import type { Hole } from './types.js';

/** Sum of every hole entered so far. Holes with no score yet do not count. */
export function totalStrokes(scores: Record<number, number>): number {
  let total = 0;
  for (const strokes of Object.values(scores)) total += strokes;
  return total;
}

/** Sum of putts logged so far. Putts are optional, so this is 0 until anyone bothers entering any. */
export function totalPutts(putts: Record<number, number>): number {
  let total = 0;
  for (const count of Object.values(putts)) total += count;
  return total;
}

/**
 * Strokes relative to par, counting only holes that have both a score and a
 * known par. A round with holes still unscored has a partial-but-honest
 * to-par for what has been played, not a mix of real and assumed strokes.
 */
export function toPar(scores: Record<number, number>, holes: Hole[]): number {
  const parByHole = new Map(holes.map((hole) => [hole.number, hole.par]));
  let diff = 0;
  for (const [holeNumber, strokes] of Object.entries(scores)) {
    const par = parByHole.get(Number(holeNumber));
    if (par != null) diff += strokes - par;
  }
  return diff;
}

export function holesPlayed(scores: Record<number, number>): number {
  return Object.keys(scores).length;
}

export function formatToPar(diff: number): string {
  if (diff === 0) return 'E';
  return diff > 0 ? `+${diff}` : `${diff}`;
}

export function coursePar(holes: Hole[]): number {
  return holes.reduce((sum, hole) => sum + hole.par, 0);
}

/** The traditional golf name for a score, by strokes relative to par on that hole. */
export function scoreName(diff: number): string {
  switch (diff) {
    case -3:
      return 'Albatross';
    case -2:
      return 'Eagle';
    case -1:
      return 'Birdie';
    case 0:
      return 'Par';
    case 1:
      return 'Bogey';
    case 2:
      return 'Double Bogey';
    case 3:
      return 'Triple Bogey';
    default:
      return diff < -3 ? `${-diff} Under` : `${diff} Over`;
  }
}
