/**
 * How many name-derived codes exist for one first name: `PRIYA250`
 * through `PRIYA259`. Ten, and no more — which is the point of
 * `NAMED_ATTEMPTS` being exported rather than a loose literal in here.
 */
export const NAMED_ATTEMPTS = 10;

/**
 * Uppercase letters and digits with the pairs that get misread removed —
 * no `O`/`0`, `I`/`1`, `S`/`5`. A referral code is read off a screen and
 * typed into another person's phone, so the cost of `O` versus `0` is a
 * friend who never gets credited.
 */
const UNAMBIGUOUS = 'ABCDEFGHJKLMNPQRTUVWXYZ2346789';

function randomSuffix(length: number): string {
  let out = '';
  for (let i = 0; i < length; i += 1) {
    out += UNAMBIGUOUS[Math.floor(Math.random() * UNAMBIGUOUS.length)];
  }
  return out;
}

/**
 * Derives a referral code the way the seed data does — `ANANYA250`-style,
 * first name uppercased plus a suffix — and falls back to a random one
 * where a name cannot produce a usable base.
 *
 * **The eleventh Priya.** For the first `NAMED_ATTEMPTS` attempts this
 * returns `PRIYA250`…`PRIYA259`, and that used to be the whole space: the
 * caller tried ten, every one was taken, and registration failed with
 * "Could not allocate a unique referral code — please retry". Retrying
 * could never work, because the space was exhausted permanently — so the
 * eleventh person with a common first name simply could not create an
 * account, on a marketplace whose target market is India. Found by an
 * audit test that seeded thirty accounts and could not get past the
 * thirtieth.
 *
 * Past that point the suffix becomes random, which keeps the readable
 * code for the people who can have one and guarantees everyone else an
 * account. Uniqueness is still the database's job — the unique index on
 * `User.referralCode` is the reservation, and the caller retries on a
 * collision.
 */
export function generateReferralCode(name: string, attempt = 0): string {
  const base = name
    .trim()
    .split(/\s+/)[0]
    ?.toUpperCase()
    .replace(/[^A-Z0-9]/g, '');

  if (base && base.length >= 2) {
    // Cap the readable part so a long name plus a suffix stays something
    // a person can say over the phone.
    const stem = base.slice(0, 12);
    if (attempt < NAMED_ATTEMPTS) return `${stem}${250 + attempt}`;
    return `${stem}${randomSuffix(4)}`;
  }
  return `HK${randomSuffix(6)}`;
}
