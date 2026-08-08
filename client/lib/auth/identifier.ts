/**
 * Which of the two things did somebody just type into the one box?
 *
 * **Advisory only.** The authority is `server/src/auth/identifier.util.ts`,
 * which parses with `libphonenumber-js` and decides what actually happens.
 * This copy exists to answer two questions the form needs before it can
 * make a request: is the button enabled yet, and does the hint under the
 * field say "we'll text you a code" or "we'll email you a code".
 *
 * It is deliberately *looser* than the server, not a reimplementation.
 * Being stricter here is the dangerous direction — it would reject a
 * number the server would have accepted, and the person is then stuck at a
 * disabled button with nothing to fix. Being looser costs one round trip
 * and a clear 400. That asymmetry is why this is 30 lines and not a
 * second copy of the phone-number library: the two are *allowed* to
 * disagree in one direction, unlike `lib/geo.ts` and its server twin,
 * which must be identical.
 */

export type IdentifierKind = "email" | "phone";

/** `null` when it is not yet plausibly either — the button stays disabled. */
export function guessIdentifierKind(raw: string): IdentifierKind | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  // An `@` cannot appear in a phone number, so its presence settles the
  // question even while the address is half-typed.
  if (trimmed.includes("@")) {
    return /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/.test(trimmed.toLowerCase()) ? "email" : null;
  }

  // Ten digits is the shortest thing the server's India default accepts.
  // Anything with a letter in it is somebody starting to type an address.
  if (/[a-z]/i.test(trimmed)) return null;
  const digits = trimmed.replace(/\D/g, "");
  return digits.length >= 10 && digits.length <= 15 ? "phone" : null;
}

/**
 * What to call it in a sentence. Used for "we sent a code to your …" and
 * for the field's own label, which changes as soon as the shape is clear
 * so the person can see they have been understood.
 */
export function describeIdentifierKind(kind: IdentifierKind | null): string {
  if (kind === "email") return "email";
  if (kind === "phone") return "phone";
  return "mobile number or email";
}
