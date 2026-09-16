/**
 * The delivery-OTP guess limit (§2.3's "Drop" step). Pure so the
 * threshold and the compare are each unit-tested without a database or a
 * running request.
 *
 * `otpAttempts` on `DeliveryJob` is the persisted counter; this file
 * never touches it, only decides what an attempt count means.
 */
export const MAX_OTP_ATTEMPTS = 5;

/** A job whose attempt count has already reached the ceiling — no further guess is even compared. */
export function isOtpLocked(attempts: number): boolean {
  return attempts >= MAX_OTP_ATTEMPTS;
}

/**
 * Constant-time compare of two 4-digit codes — the brief's own wording
 * ("compares OTP in constant time"). Both are fixed-length numeric
 * strings, so a naive `===` would leak nothing an attacker could use over
 * a 4-digit space anyway, but this keeps the same discipline as every
 * other secret compare in this codebase (`ShippingService.assertCallbackAuthorised`).
 */
export function otpMatches(candidate: string, actual: string): boolean {
  if (candidate.length !== actual.length) return false;
  let diff = 0;
  for (let i = 0; i < actual.length; i += 1) {
    diff |= candidate.charCodeAt(i) ^ actual.charCodeAt(i);
  }
  return diff === 0;
}

export const LOCKED_SENTENCE =
  'Too many incorrect delivery codes were entered for this order. It needs support to unlock — contact the Homekrafted team with the order number.';
