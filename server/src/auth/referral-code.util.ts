/**
 * Derives a referral code the way the seed data does (`ANANYA250`-style —
 * first name uppercased + a fixed suffix), falling back to a random
 * alphanumeric one if the name doesn't yield anything usable. Collisions
 * are handled by the caller retrying with `attempt > 0` appended.
 */
export function generateReferralCode(name: string, attempt = 0): string {
  const base = name
    .trim()
    .split(/\s+/)[0]
    ?.toUpperCase()
    .replace(/[^A-Z0-9]/g, '');

  const suffix = attempt > 0 ? `${250 + attempt}` : '250';
  if (base && base.length >= 2) {
    return `${base}${suffix}`;
  }
  return `HK${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}
