import { parsePhoneNumberFromString } from 'libphonenumber-js';

/**
 * Turns whatever somebody typed into one box into a phone number or an
 * email address.
 *
 * The single-field sign-in form (M25) replaced a Phone/Email tab pair, so
 * this is the thing that used to be a tab. It runs on the **server** and
 * the client has its own copy for enabling the button
 * (`client/lib/auth/identifier.ts`) — the two must agree, but only this
 * one decides anything, because the client's copy is advisory and a
 * request can be made without it.
 *
 * Deliberately not a validator. It answers "which of the two is this, and
 * what is its canonical form" and refuses anything that is clearly
 * neither; whether the address exists is somebody else's question.
 */

export type IdentifierKind = 'email' | 'phone';

export interface ParsedIdentifier {
  kind: IdentifierKind;
  /** Canonical form: lowercased email, or E.164 phone. This is what hits the database. */
  value: string;
}

/**
 * Default region for a bare national number.
 *
 * Every HomeKrafter and buyer is in the Chandigarh tricity, and a home
 * cook types `9845012345`, not `+919845012345`. Without a default that is
 * simply invalid, and the form rejects the most common thing anyone will
 * type. An explicit `+<country>` still wins, so this narrows nothing.
 */
const DEFAULT_REGION = 'IN';

/**
 * An email must have exactly one `@` with something either side, and the
 * domain must contain a dot. That is looser than RFC 5322 and stricter
 * than "contains @", which is the right place to sit: the mailbox either
 * receives the verification code or it doesn't, and no regex settles that.
 */
const EMAIL = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/;

/**
 * `null` when it is neither — the caller turns that into a 400.
 *
 * Order matters. An `@` is checked first because it can never appear in a
 * phone number, so anything containing one is an email attempt and should
 * be reported as a malformed email rather than a malformed number.
 */
export function parseIdentifier(raw: string): ParsedIdentifier | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  if (trimmed.includes('@')) {
    const email = trimmed.toLowerCase();
    return EMAIL.test(email) ? { kind: 'email', value: email } : null;
  }

  // Everything that isn't an email attempt is treated as a number, so
  // spaces, dashes and brackets a person naturally types are fine.
  const phone = parsePhoneNumberFromString(trimmed, DEFAULT_REGION);
  if (phone?.isValid()) {
    return { kind: 'phone', value: phone.number };
  }

  return null;
}

/**
 * How an identifier is shown back to somebody — in a "we sent a code to…"
 * line, or in an error.
 *
 * Emails are shown whole; a phone number is shown as typed-back E.164.
 * Neither is masked, because the person reading it is the person who just
 * typed it, and masking a number they are checking for a typo defeats the
 * only reason it is on screen.
 */
export function describeIdentifier(parsed: ParsedIdentifier): string {
  return parsed.value;
}
