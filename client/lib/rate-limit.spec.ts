import { clientKeyFrom, RateLimiter } from "./rate-limit";

/**
 * Pure-function drive of the token bucket — every instant hand-picked,
 * nothing reads the clock (the same rule `occasions.spec.ts` and
 * `schedule.spec.ts` pin for their modules).
 */
describe("RateLimiter", () => {
  const t0 = Date.parse("2026-08-15T10:00:00.000Z");

  it("allows a cold burst up to capacity, then refuses", () => {
    const limiter = new RateLimiter({ capacity: 3, refillPerMinute: 3 });
    expect(limiter.take("a", t0)).toBe(true);
    expect(limiter.take("a", t0)).toBe(true);
    expect(limiter.take("a", t0)).toBe(true);
    expect(limiter.take("a", t0)).toBe(false);
  });

  it("refills at the stated rate: 3/min means one token back every 20s", () => {
    const limiter = new RateLimiter({ capacity: 3, refillPerMinute: 3 });
    for (let i = 0; i < 3; i += 1) limiter.take("a", t0);
    expect(limiter.take("a", t0 + 19_000)).toBe(false); // 0.95 tokens — not yet
    expect(limiter.take("a", t0 + 20_000)).toBe(true); // exactly 1 token
    expect(limiter.take("a", t0 + 21_000)).toBe(false); // spent it
  });

  it("never refills past capacity, however long the idle gap", () => {
    const limiter = new RateLimiter({ capacity: 2, refillPerMinute: 60 });
    limiter.take("a", t0);
    const dayLater = t0 + 24 * 60 * 60 * 1000;
    expect(limiter.take("a", dayLater)).toBe(true);
    expect(limiter.take("a", dayLater)).toBe(true);
    expect(limiter.take("a", dayLater)).toBe(false);
  });

  it("keys are independent — one flooder does not spend a neighbour's tokens", () => {
    const limiter = new RateLimiter({ capacity: 1, refillPerMinute: 1 });
    expect(limiter.take("flooder", t0)).toBe(true);
    expect(limiter.take("flooder", t0)).toBe(false);
    expect(limiter.take("bystander", t0)).toBe(true);
  });

  it("sweeps idle buckets once the map outgrows the threshold", () => {
    const limiter = new RateLimiter({
      capacity: 1,
      refillPerMinute: 1,
      sweepAbove: 5,
      idleMs: 60_000,
    });
    for (let i = 0; i < 6; i += 1) limiter.take(`old-${i}`, t0);
    expect(limiter.size()).toBe(6);
    // Past the idle window, the next take sweeps all six stale buckets.
    limiter.take("fresh", t0 + 61_000);
    expect(limiter.size()).toBe(1);
  });

  it("a clock that goes backwards never mints tokens", () => {
    const limiter = new RateLimiter({ capacity: 1, refillPerMinute: 60 });
    limiter.take("a", t0);
    expect(limiter.take("a", t0 - 60_000)).toBe(false);
  });
});

describe("clientKeyFrom", () => {
  it("takes the first hop of x-forwarded-for", () => {
    expect(clientKeyFrom("203.0.113.9, 10.0.0.1")).toBe("203.0.113.9");
  });

  it("falls back to a shared local bucket without a proxy header", () => {
    expect(clientKeyFrom(null)).toBe("local");
    expect(clientKeyFrom("  ")).toBe("local");
  });

  it("clips an absurd header rather than storing it as a key", () => {
    expect(clientKeyFrom("x".repeat(500)).length).toBe(64);
  });
});
