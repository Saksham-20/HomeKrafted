/**
 * Turns a raw `missingForSubmit`/`unapprovedRequiredDocs`-style key into a
 * short clause a rider can act on.
 *
 * **Why this exists as a lookup rather than the raw key.**
 * `AllExceptionsFilter` strips every field off a thrown body except
 * `message`/`code` (`docs/API.md`'s one envelope, `{ error: { code,
 * message } }`) — the R1 brief's shape for a submit refusal was a
 * structured `{ message, missing: string[] }` 400 body, and that
 * `missing` field would be silently dropped before it ever reached the
 * client. Throwing `new BadRequestException(missing.map(describeMissing))`
 * instead uses the filter's own supported multi-item shape — the same one
 * class-validator's field errors use — which joins the array with `'; '`
 * into one sentence and marks the response `VALIDATION_ERROR`.
 *
 * Shared between `RiderOnboardingService.submit` (`src/rider/`) and
 * `AdminRidersService.approve` (`src/admin/riders/`), which is why it is
 * its own pure module rather than living in either service file. Keys are
 * a mix of field names (`fullName`, `homeZoneId`, …) and
 * `RiderDocumentKind`s (`selfie`, `aadhaar_front`, …).
 */
const MISSING_ITEM_LABELS: Record<string, string> = {
  fullName: 'your full name',
  dateOfBirth: 'your date of birth',
  homeLine1: 'your home address',
  homeCity: 'your home city',
  homePincode: 'your home pincode',
  emergencyName: 'an emergency contact name',
  emergencyRelation: 'how your emergency contact knows you',
  emergencyPhone: 'an emergency contact phone number',
  vehicleType: 'your vehicle type',
  vehicleNumber: 'your vehicle registration number',
  dlNumber: 'your driving licence number',
  dlExpiry: 'your driving licence expiry date',
  aadhaarLast4: 'the last 4 digits of your Aadhaar',
  panNumber: 'your PAN',
  homeZoneId: 'your zone',
  tshirtSize: 'your T-shirt size',
  bankAccountNumber: 'a bank account or UPI ID to pay you',
  agreementVersion: 'accepting the Rider Agreement',
  privacyVersion: 'accepting the Privacy Policy',
  locationConsent: 'consenting to location use while on duty',
  bgvConsent: 'consenting to a background-verification check',
  selfie: 'a selfie',
  aadhaar_front: 'a photo of the front of your Aadhaar card',
  aadhaar_back: 'a photo of the back of your Aadhaar card',
  pan: 'a photo of your PAN card',
  dl_front: 'a photo of the front of your driving licence',
  dl_back: 'a photo of the back of your driving licence',
  vehicle_rc: 'a photo of your vehicle’s RC',
  vehicle_insurance: 'a photo of your vehicle insurance',
  vehicle_photo: 'a photo of your vehicle with its number plate',
  bank_proof: 'proof of your bank account (a cancelled cheque or passbook photo)',
};

export function describeMissing(key: string): string {
  return MISSING_ITEM_LABELS[key] ?? key;
}
