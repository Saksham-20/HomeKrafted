/**
 * What the `/sell` form checks before it lets somebody submit (M32).
 *
 * A mirror of `server/src/seller-applications/application-fields.ts`, and
 * the same relationship the two identifier parsers have (M17): **the
 * server decides**, this only decides what the form says while somebody
 * is typing. The rules here are deliberately the shallow ones — is this
 * an email in the name box, is this two characters of nothing — because a
 * client that is *stricter* than the server blocks a legitimate applicant
 * at a dead button with no way to argue.
 *
 * The reason any of it exists: production has storefronts named
 * `jashanpreetsingh3105@gmail.com` and `Abc`. `businessName` becomes
 * `Vendor.name` and `Seller.displayName` at approval — it is on every
 * product card and every order — and until M32 it was validated as
 * "at least one character".
 */

const LOOKS_LIKE_EMAIL = /@/;
const LOOKS_LIKE_PHONE = /^[\d\s+()-]+$/;
const HAS_LETTERS = /\p{L}.*\p{L}/u;
/** Looser than RFC 5322 and stricter than "contains @" — the same shape the sign-in parser uses. */
const EMAIL = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/;

/** `null` when it is fine. The string is shown under the field, so it names the box and says what to do. */
export function businessNameError(value: string): string | null {
  const v = value.trim();
  if (!v) return null; // Empty is "not filled in yet", handled by the submit button.
  if (v.length < 2) return "At least 2 characters.";
  if (v.length > 80) return "Keep it under 80 characters.";
  if (LOOKS_LIKE_EMAIL.test(v))
    return "That looks like an email address — this is the name buyers will see.";
  if (LOOKS_LIKE_PHONE.test(v))
    return "That looks like a phone number — this is the name buyers will see.";
  if (!HAS_LETTERS.test(v)) return "Use the name buyers will see.";
  return null;
}

export function contactNameError(value: string): string | null {
  const v = value.trim();
  if (!v) return null;
  if (v.length < 2) return "At least 2 characters.";
  if (v.length > 60) return "Keep it under 60 characters.";
  if (LOOKS_LIKE_EMAIL.test(v)) return "That looks like an email address, not a name.";
  if (!HAS_LETTERS.test(v)) return "Use your name, not a number.";
  return null;
}

export function emailError(value: string): string | null {
  const v = value.trim();
  if (!v) return null;
  return EMAIL.test(v) ? null : "Check this address — we send your sign-in details to it.";
}

/**
 * Ten digits, once anything decorative is stripped, or an explicit `+91`.
 *
 * Looser than the server, which parses through `libphonenumber-js` — on
 * purpose. A false positive here costs one request and a clear message; a
 * false negative strands somebody at a dead button with a working number
 * typed in.
 */
export function phoneError(value: string): string | null {
  const digits = value.replace(/[\s+()-]/g, "");
  if (!digits) return null;
  if (!/^\d+$/.test(digits)) return "Digits only, e.g. 98450 12345.";
  const national = digits.startsWith("91") && digits.length > 10 ? digits.slice(2) : digits;
  if (national.length !== 10) return "An Indian mobile number is 10 digits.";
  return null;
}

/** 14 digits. Whether the licence is real is a human decision, made by an admin. */
export function fssaiError(value: string): string | null {
  const v = value.replace(/\s/g, "");
  if (!v) return null;
  return /^\d{14}$/.test(v) ? null : "An FSSAI number is 14 digits.";
}

export function instagramError(value: string): string | null {
  const raw = value.trim().replace(/^@/, "");
  if (!raw) return null;
  const asUrl = raw.match(/^(?:https?:\/\/)?(?:www\.)?instagram\.com\/([^/?#\s]+)/i);
  const handle = asUrl ? asUrl[1] : raw;
  return /^[A-Za-z0-9._]{1,30}$/.test(handle) ? null : "Enter your handle, e.g. @your.kitchen.";
}

export function websiteError(value: string): string | null {
  const raw = value.trim();
  if (!raw) return null;
  const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    const parsed = new URL(withProtocol);
    return parsed.hostname.includes(".") ? null : "That does not look like a web address.";
  } catch {
    return "That does not look like a web address.";
  }
}
