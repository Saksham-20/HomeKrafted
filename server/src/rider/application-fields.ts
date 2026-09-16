import { parseIdentifier } from '../auth/identifier.util';

/**
 * What a rider's onboarding form (`PUT /rider/me/application`) is allowed
 * to hold, checked field-by-field in `RiderOnboardingService` rather than
 * as class-validator decorators on the DTO — same split as
 * `seller-applications/application-fields.ts`: the DTO checks shape (is
 * this a string, is it present), these functions check whether the value
 * is *usable*, and the message returned is what the app shows verbatim.
 * On a form somebody is filling in about themselves, the message is the
 * product.
 */

/** Six digits, and Indian pincodes never begin with zero. Shape only — see `checkHomePincode`'s comment. */
const PINCODE_SHAPE = /^[1-9]\d{5}$/;

/** `AB12CD3456` / `AB1CD3456` shapes, after uppercasing and stripping whitespace. */
const VEHICLE_NUMBER_SHAPE = /^[A-Z]{2}\d{1,2}[A-Z]{0,3}\d{4}$/;

const PAN_SHAPE = /^[A-Z]{5}\d{4}[A-Z]$/;

const IFSC_SHAPE = /^[A-Z]{4}0[A-Z0-9]{6}$/;

/** A rider must be at least this old to hold a licence for any of the four vehicle types, bicycle included (Motor Vehicles Act, and this platform's own floor). */
const MIN_AGE_YEARS = 18;

/**
 * `dateOfBirth` — 18+, computed against `now` so the check is pure and
 * testable rather than reading the clock (the M12 rule, applied here
 * because a person's age changes under a fixed "18" comparison the day
 * they turn 18, and a hand-computed test expectation would rot).
 */
export function checkDateOfBirth(raw: string, now: Date): { date: Date } | { error: string } {
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) {
    return { error: 'That does not look like a date of birth.' };
  }
  if (date.getTime() > now.getTime()) {
    return { error: 'Date of birth cannot be in the future.' };
  }

  let age = now.getFullYear() - date.getFullYear();
  const monthDay = now.getMonth() - date.getMonth() || now.getDate() - date.getDate();
  if (monthDay < 0) age -= 1;

  if (age < MIN_AGE_YEARS) {
    return { error: `You need to be ${MIN_AGE_YEARS} or older to ride for Homekrafted.` };
  }
  return { date };
}

/**
 * `homePincode` — shape only, same as the `/sell` form's pincode field.
 * Unlike a HomeKrafter's kitchen pincode, nothing here resolves it
 * against `server/src/common/pincodes.json` for a district/coordinate —
 * a rider's home address is not used to place them in a zone (their
 * chosen `homeZoneId` and, later, their live GPS are), so there is
 * nothing to look up it for.
 */
export function checkHomePincode(value: string): string | null {
  if (!PINCODE_SHAPE.test(value.trim())) {
    return 'Enter a 6-digit pincode.';
  }
  return null;
}

/**
 * `emergencyPhone` — a real Indian mobile number, and not the rider's
 * own. A contact that rings the person having the emergency is not an
 * emergency contact.
 */
export function checkEmergencyPhone(value: string, ownPhone: string | null): { phone: string } | { error: string } {
  const parsed = parseIdentifier(value);
  if (!parsed || parsed.kind !== 'phone') {
    return { error: 'Enter a mobile number for your emergency contact, e.g. 98450 12345.' };
  }
  if (ownPhone && parsed.value === ownPhone) {
    return { error: 'Your emergency contact needs to be someone else — not your own number.' };
  }
  return { phone: parsed.value };
}

/**
 * `vehicleNumber` — uppercased and stripped of interior spaces before
 * the shape check, because `PB 65 AB 1234` is exactly how somebody reads
 * their own plate off the vehicle.
 */
export function normalizeVehicleNumber(value: string): { value: string } | { error: string } {
  const normalized = value.toUpperCase().replace(/\s+/g, '');
  if (!VEHICLE_NUMBER_SHAPE.test(normalized)) {
    return { error: 'Enter your registration number as it appears on your RC, e.g. PB65AB1234.' };
  }
  return { value: normalized };
}

export function checkPan(value: string): string | null {
  if (!PAN_SHAPE.test(value.toUpperCase().trim())) {
    return 'A PAN is 10 characters — five letters, four digits, one letter, e.g. ABCDE1234F.';
  }
  return null;
}

export function checkIfsc(value: string): string | null {
  if (!IFSC_SHAPE.test(value.toUpperCase().trim())) {
    return 'An IFSC code is 11 characters — four letters, a zero, then six letters or digits, e.g. HDFC0001234.';
  }
  return null;
}

/**
 * `aadhaarLast4` — D12: we never store a full Aadhaar number, and this is
 * the check that stops one arriving by accident. A 12-digit input gets
 * its own message rather than the generic shape error, because it is the
 * one mistake somebody filling this in is actually likely to make —
 * typing the whole number because that is what every other form asks
 * for.
 */
export function checkAadhaarLast4(value: string): { value: string } | { error: string } {
  const digits = value.trim();
  if (/^\d{12}$/.test(digits)) {
    return { error: 'Only the last 4 digits of your Aadhaar number — never the full 12.' };
  }
  if (!/^\d{4}$/.test(digits)) {
    return { error: 'Enter the last 4 digits of your Aadhaar number.' };
  }
  return { value: digits };
}
