import * as crypto from 'crypto';

/**
 * The alphabet a temporary password is drawn from.
 *
 * No `O`/`0`, no `I`/`l`/`1`, no `S`/`5`. This credential's whole job is
 * to survive being read down a phone line to a home cook and typed back
 * in — an admin dictating "zero or oh?" is the failure mode, not a weak
 * character set. Losing eight characters costs about half a bit each and
 * is bought back by the length below.
 */
const ALPHABET = 'ABCDEFGHJKMNPQRTUVWXYZabcdefghijkmnpqrtuvwxyz23456789';

/** Four groups of four — long enough to be safe, grouped so it can be read aloud. */
const GROUPS = 4;
const GROUP_SIZE = 4;

/**
 * A temporary password an admin hands to a newly approved HomeKrafter.
 *
 * ~91 bits of entropy from `crypto.randomBytes`, never `Math.random`.
 * Rejection sampling rather than `% ALPHABET.length`, because a modulo
 * over 256 would make the first few characters of the alphabet slightly
 * likelier — a small bias, but a free one to avoid.
 *
 * It is never stored in plaintext: the caller hashes it, shows it to the
 * admin once, and the account it belongs to is forced to replace it at
 * first sign-in (`User.mustChangePassword`).
 */
export function generateTemporaryPassword(): string {
  const chars: string[] = [];
  const limit = Math.floor(256 / ALPHABET.length) * ALPHABET.length;

  while (chars.length < GROUPS * GROUP_SIZE) {
    for (const byte of crypto.randomBytes(32)) {
      if (chars.length >= GROUPS * GROUP_SIZE) break;
      if (byte >= limit) continue;
      chars.push(ALPHABET[byte % ALPHABET.length]);
    }
  }

  return Array.from({ length: GROUPS }, (_, group) =>
    chars.slice(group * GROUP_SIZE, (group + 1) * GROUP_SIZE).join(''),
  ).join('-');
}
