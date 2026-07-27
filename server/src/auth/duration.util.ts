/**
 * Minimal duration-string parser for JWT TTL config values ("15m", "7d",
 * "30s", "1h") — avoids pulling in the `ms` package for one small need.
 * Only the units Nest's `JwtModule`/this app's `.env.example` actually use
 * are supported.
 */
export function parseDurationToMs(input: string): number {
  const match = /^(\d+)\s*(ms|s|m|h|d)$/.exec(input.trim());
  if (!match) {
    throw new Error(`Unsupported duration format: "${input}" (expected e.g. "15m", "7d")`);
  }
  const value = parseInt(match[1], 10);
  const unit = match[2];
  const unitMs: Record<string, number> = {
    ms: 1,
    s: 1000,
    m: 60_000,
    h: 3_600_000,
    d: 86_400_000,
  };
  return value * unitMs[unit];
}
