import { beforeEach, describe, expect, it } from 'vitest';
import { checkRateLimit, clearRateLimit, resetAllRateLimits } from '../src/rateLimit.js';

beforeEach(() => {
  resetAllRateLimits();
});

describe('checkRateLimit', () => {
  it('allows up to maxAttempts within the window', () => {
    for (let i = 0; i < 5; i += 1) {
      expect(checkRateLimit('k', 5, 60_000, 1000)).toBe(true);
    }
    expect(checkRateLimit('k', 5, 60_000, 1000)).toBe(false);
  });

  it('resets once the window has elapsed', () => {
    for (let i = 0; i < 5; i += 1) checkRateLimit('k', 5, 60_000, 1000);
    expect(checkRateLimit('k', 5, 60_000, 1000)).toBe(false);
    expect(checkRateLimit('k', 5, 60_000, 1000 + 60_000)).toBe(true);
  });

  it('tracks keys independently', () => {
    for (let i = 0; i < 5; i += 1) checkRateLimit('a', 5, 60_000, 1000);
    expect(checkRateLimit('a', 5, 60_000, 1000)).toBe(false);
    expect(checkRateLimit('b', 5, 60_000, 1000)).toBe(true);
  });
});

describe('clearRateLimit', () => {
  it('lets a key start fresh again', () => {
    for (let i = 0; i < 5; i += 1) checkRateLimit('k', 5, 60_000, 1000);
    expect(checkRateLimit('k', 5, 60_000, 1000)).toBe(false);
    clearRateLimit('k');
    expect(checkRateLimit('k', 5, 60_000, 1000)).toBe(true);
  });
});
