/**
 * Snowflakes for the seasonal snowfall (2026-11-24) — positions, sizes and
 * timings, from a fixed seed so the server and the browser draw the same
 * flakes (a `Math.random()` here would be a hydration mismatch on every
 * load). Plain data: `client/lib` is shared with the native app.
 */
export interface Flake {
  /** Horizontal position, % of the snowing area's width. */
  x: number;
  /** Diameter in px — small on purpose: this is weather, not decoration. */
  size: number;
  /** Seconds to fall the full height — slow, so nothing reads as rain. */
  fall: number;
  /** A negative start (s), so the area opens already snowing, not empty. */
  delay: number;
  /** Side-to-side drift, px either way, and its period (s). */
  sway: number;
  swayPeriod: number;
  opacity: number;
}

/** mulberry32: a tiny, well-distributed seeded generator. */
function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const round = (value: number, places = 2) => Math.round(value * 10 ** places) / 10 ** places;

export function snowflakes(count: number, seed: number): Flake[] {
  const next = seeded(seed);
  const range = (min: number, max: number) => min + next() * (max - min);
  return Array.from({ length: count }, () => {
    const fall = range(16, 30);
    return {
      x: round(range(0, 100)),
      size: round(range(1.6, 3.6)),
      fall: round(fall),
      delay: round(-range(0, fall)),
      sway: round(range(6, 18)),
      swayPeriod: round(range(3.5, 6.5)),
      opacity: round(range(0.45, 0.9)),
    };
  });
}
