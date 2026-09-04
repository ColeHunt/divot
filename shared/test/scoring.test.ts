import { describe, expect, it } from 'vitest';
import { coursePar, formatToPar, holesPlayed, toPar, totalStrokes } from '../src/scoring.js';
import type { Hole } from '../src/types.js';

const HOLES: Hole[] = [
  { number: 1, par: 4, yardage: 380 },
  { number: 2, par: 3, yardage: 165 },
  { number: 3, par: 5, yardage: 510 },
];

describe('totalStrokes', () => {
  it('sums only entered holes', () => {
    expect(totalStrokes({ 1: 5, 2: 3 })).toBe(8);
    expect(totalStrokes({})).toBe(0);
  });
});

describe('toPar', () => {
  it('compares entered holes against their par', () => {
    expect(toPar({ 1: 5, 2: 3 }, HOLES)).toBe(1); // +1, even on hole 2
    expect(toPar({ 1: 4, 2: 3, 3: 5 }, HOLES)).toBe(0); // even
  });

  it('ignores holes with no known par', () => {
    expect(toPar({ 1: 5, 99: 4 }, HOLES)).toBe(1);
  });
});

describe('holesPlayed', () => {
  it('counts entered holes regardless of score', () => {
    expect(holesPlayed({ 1: 4, 2: 0 })).toBe(2);
  });
});

describe('formatToPar', () => {
  it('formats even par as E, and signs the rest', () => {
    expect(formatToPar(0)).toBe('E');
    expect(formatToPar(3)).toBe('+3');
    expect(formatToPar(-2)).toBe('-2');
  });
});

describe('coursePar', () => {
  it('sums every hole', () => {
    expect(coursePar(HOLES)).toBe(12);
  });
});
