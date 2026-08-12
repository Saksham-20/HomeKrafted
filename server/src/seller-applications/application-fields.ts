import { parseIdentifier } from '../auth/identifier.util';

/**
 * What a `/sell` application's free-text fields are allowed to be (M32).
 *
 * Written because production has storefronts called
 * `jashanpreetsingh3105@gmail.com` and `Abc`. The first is what happens
 * when "Business / maker name" is a bare `MinLength(1)` string and
 * somebody's browser autofills it with their email; the second is what
 * happens when nothing asks for more. `businessName` becomes
 * `Vendor.name` and `Seller.displayName` at approval — it is on every
 * product card and every order — so it is the one field on this form that
 * a lazy validator costs a real person something.
 *
 * The rules are deliberately shallow. They reject what is definitely not
 * a name; they do not attempt to judge whether a name is *good*, which is
 * the applicant's business and the admin's decision.
 */

/** A name that is really an email address. The single most common real case. */
const LOOKS_LIKE_EMAIL = /@/;

/** A name that is really a phone number: digits, spaces, +, -, () and nothing else. */
const LOOKS_LIKE_PHONE = /^[\d\s+()-]+$/;

/** At least two letters somewhere. Rejects `...`, `123`, `--`, and an empty-after-trim string. */
const HAS_LETTERS = /\p{L}.*\p{L}/u;

export interface FieldProblem {
  field: string;
  message: string;
}

/**
 * `null` when the name is acceptable, otherwise the sentence to show the
 * applicant. Never a generic "invalid" — the person is filling in a form
 * about their own kitchen and needs to know which box and why.
 */
export function checkBusinessName(value: string): string | null {
  const trimmed = value.trim();
  if (trimmed.length < 2) return 'Tell us what your kitchen or studio is called — at least 2 characters.';
  if (trimmed.length > 80) return 'That is longer than 80 characters. Use the name buyers will see.';
  if (LOOKS_LIKE_EMAIL.test(trimmed)) {
    return 'That looks like an email address. This is the name buyers will see on your storefront — your email goes in the box below.';
  }
  if (LOOKS_LIKE_PHONE.test(trimmed)) {
    return 'That looks like a phone number. This is the name buyers will see on your storefront.';
  }
  if (!HAS_LETTERS.test(trimmed)) return 'Use the name buyers will see — at least two letters.';
  return null;
}

export function checkContactName(value: string): string | null {
  const trimmed = value.trim();
  if (trimmed.length < 2) return 'Tell us your name — at least 2 characters.';
  if (trimmed.length > 60) return 'That is longer than 60 characters.';
  if (LOOKS_LIKE_EMAIL.test(trimmed)) return 'That looks like an email address, not a name.';
  if (!HAS_LETTERS.test(trimmed)) return 'Use your name, not a number.';
  return null;
}

/**
 * A phone number we can actually ring.
 *
 * This is the field the entire onboarding path depends on while no SMS
 * provider key is set: an admin reads sign-in details down it. A row with
 * `x` in this column is an approved kitchen nobody can reach.
 *
 * Parsed through the same `libphonenumber-js` seam sign-in uses, region
 * `IN`, so `9845012345` and `+91 98450 12345` are both fine and both
 * store as E.164.
 */
export function normalizePhone(value: string): { phone: string } | { error: string } {
  const parsed = parseIdentifier(value);
  if (!parsed || parsed.kind !== 'phone') {
    return { error: 'Enter a mobile number we can reach you on, e.g. 98450 12345.' };
  }
  return { phone: parsed.value };
}

/**
 * FSSAI licence numbers are 14 digits. Checked for shape only — whether
 * the licence is real, current and theirs is a human decision, made on
 * `PATCH /admin/sellers/:id/verification`, and nothing on this form may
 * touch the badge (M16).
 */
export function checkFssaiNumber(value: string): string | null {
  const digits = value.replace(/\s/g, '');
  if (!/^\d{14}$/.test(digits)) return 'An FSSAI number is 14 digits. Leave it blank if you do not have one yet.';
  return null;
}

/**
 * Accepts a full URL or the shorthand people actually type — `@kitchen`,
 * `instagram.com/kitchen`, `kitchen`. Returns a canonical profile URL.
 *
 * Rejecting `@kitchen` because it is not a URL would be the form arguing
 * with the way every Instagram handle on earth is written down.
 */
export function normalizeInstagram(value: string): { url: string } | { error: string } {
  const raw = value.trim().replace(/^@/, '');
  if (!raw) return { url: '' };
  const asUrl = raw.match(/^(?:https?:\/\/)?(?:www\.)?instagram\.com\/([^/?#\s]+)/i);
  const handle = asUrl ? asUrl[1] : raw;
  if (!/^[A-Za-z0-9._]{1,30}$/.test(handle)) {
    return { error: 'Enter your Instagram handle, e.g. @your.kitchen.' };
  }
  return { url: `https://instagram.com/${handle}` };
}

/** A website, with the protocol filled in when they left it out. */
export function normalizeWebsite(value: string): { url: string } | { error: string } {
  const raw = value.trim();
  if (!raw) return { url: '' };
  const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  let parsed: URL;
  try {
    parsed = new URL(withProtocol);
  } catch {
    return { error: 'That does not look like a web address.' };
  }
  // A hostname with no dot is a typo or an intranet name, not a shop.
  if (!parsed.hostname.includes('.')) return { error: 'That does not look like a web address.' };
  if (withProtocol.length > 200) return { error: 'That address is too long.' };
  return { url: parsed.toString() };
}
