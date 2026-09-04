import type { Hole } from './types.js';

/** Sum of every hole entered so far. Holes with no score yet do not count. */
export function totalStrokes(scores: Record<number, number>): number {
  let total = 0;
  for (const strokes of Object.values(scores)) total += strokes;
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
