/**
 * A tiny in-memory token bucket, pure enough to test (M37).
 *
 * Built for `app/client-errors/route.ts` — an unauthenticated beacon
 * whose per-request payload is bounded but whose *volume* was not, so a
 * script could write log lines as fast as it could POST. This caps each
 * caller without adding a store or a dependency, which matters on that
 * route more than most: it must keep working when everything else is
 * broken (that is its whole job), so it can depend on nothing.
 *
 * Every function takes `now` rather than reading the clock — the house
 * rule (`lib/occasions.ts`, `lib/schedule.ts`) that keeps this a pure
 * function a spec can drive with hand-picked instants.
 *
 * Deliberate limits of the design, acceptable for a log-flood guard and
 * to be revisited before guarding anything more valuable:
 * - **Per process.** pm2 runs one Next process today; under a cluster
 *   each worker would have its own buckets, multiplying the effective
 *   limit by the worker count.
 * - **Keyed on `x-forwarded-for`'s first hop**, which nginx sets. A
 *   caller who can vary that header (hitting Next directly, not through
 *   nginx) gets a fresh bucket per spoofed value — bounded by the sweep
 *   cap below, and worth exactly the log line it buys them.
 */

export interface TokenBucketState {
  /** Tokens left, fractional between refills. */
  tokens: number;
  /** Epoch ms of the last refill accounting. */
  lastRefillAt: number;
}

export interface RateLimiterOptions {
  /** Bucket size — how big a burst is allowed from a cold start. */
  capacity: number;
  /** Tokens added back per minute. */
  refillPerMinute: number;
  /** Bucket count that triggers a sweep of idle entries on the next take. */
  sweepAbove?: number;
  /** How long a bucket must sit untouched before a sweep may drop it (ms). */
  idleMs?: number;
}

const DEFAULT_SWEEP_ABOVE = 512;
const DEFAULT_IDLE_MS = 10 * 60 * 1000;

export class RateLimiter {
  private readonly buckets = new Map<string, TokenBucketState>();
  private readonly capacity: number;
  private readonly refillPerMinute: number;
  private readonly sweepAbove: number;
  private readonly idleMs: number;

  constructor(options: RateLimiterOptions) {
    this.capacity = options.capacity;
    this.refillPerMinute = options.refillPerMinute;
    this.sweepAbove = options.sweepAbove ?? DEFAULT_SWEEP_ABOVE;
    this.idleMs = options.idleMs ?? DEFAULT_IDLE_MS;
  }

  /**
   * Spend one token for `key`. `true` = allowed. A cold key starts with a
   * full bucket, so the first `capacity` calls always pass.
   */
  take(key: string, now: number): boolean {
    this.maybeSweep(now);

    const bucket = this.buckets.get(key);
    if (!bucket) {
      this.buckets.set(key, { tokens: this.capacity - 1, lastRefillAt: now });
      return true;
    }

    const elapsedMinutes = Math.max(0, now - bucket.lastRefillAt) / 60_000;
    bucket.tokens = Math.min(this.capacity, bucket.tokens + elapsedMinutes * this.refillPerMinute);
    bucket.lastRefillAt = now;

    if (bucket.tokens < 1) return false;
    bucket.tokens -= 1;
    return true;
  }

  /** For tests and diagnostics only. */
  size(): number {
    return this.buckets.size;
  }

  /**
   * Bounded memory without a timer: once the map outgrows `sweepAbove`,
   * the next `take` drops every bucket idle past `idleMs`. An idle bucket
   * would have refilled to full anyway, so dropping it changes nothing
   * about what its owner is allowed to do.
   */
  private maybeSweep(now: number): void {
    if (this.buckets.size <= this.sweepAbove) return;
    for (const [key, bucket] of this.buckets) {
      if (now - bucket.lastRefillAt > this.idleMs) this.buckets.delete(key);
    }
  }
}

/**
 * The beacon's caller key: first hop of `x-forwarded-for` (what nginx
 * writes), else a shared local bucket — in dev there is no proxy and
 * everything is one machine anyway.
 */
export function clientKeyFrom(forwardedFor: string | null): string {
  const first = forwardedFor?.split(",")[0]?.trim();
  return first && first.length > 0 ? first.slice(0, 64) : "local";
}
