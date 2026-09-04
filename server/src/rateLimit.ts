/**
 * A minimal fixed-window rate limiter, in-memory. Good enough for a single-
 * process app on one box — no need for anything backed by SQLite or Redis at
 * this scale, and it resetting on a restart is fine for what it's guarding.
 */

interface Bucket {
  count: number;
  windowStart: number;
}

const buckets = new Map<string, Bucket>();

/** Buckets older than this are swept regardless of the window that created them, so memory can't grow unbounded. */
const MAX_BUCKET_AGE_MS = 3_600_000;
const SWEEP_INTERVAL_MS = 600_000;

let sweepTimer: NodeJS.Timeout | null = null;

function ensureSweeping(): void {
  if (sweepTimer) return;
  sweepTimer = setInterval(() => {
    const now = Date.now();
    for (const [key, bucket] of buckets) {
      if (now - bucket.windowStart >= MAX_BUCKET_AGE_MS) buckets.delete(key);
    }
  }, SWEEP_INTERVAL_MS);
  sweepTimer.unref();
}

/** Returns true if `key` is still within its allowance; false once it has exceeded maxAttempts in the window. */
export function checkRateLimit(
  key: string,
  maxAttempts: number,
  windowMs: number,
  now = Date.now(),
): boolean {
  ensureSweeping();
  const bucket = buckets.get(key);
  if (!bucket || now - bucket.windowStart >= windowMs) {
    buckets.set(key, { count: 1, windowStart: now });
    return true;
  }
  bucket.count += 1;
  return bucket.count <= maxAttempts;
}

/** Clears a key's bucket — called on a successful attempt so past failures don't linger against it. */
export function clearRateLimit(key: string): void {
  buckets.delete(key);
}

/** Test-only escape hatch so each test starts with a clean slate. */
export function resetAllRateLimits(): void {
  buckets.clear();
}
