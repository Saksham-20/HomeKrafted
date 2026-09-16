import { RiderDocumentKind, VehicleType } from '@prisma/client';

/** Every rider, whatever they ride, needs these to be identified and paid. */
const BASE_DOCUMENTS: RiderDocumentKind[] = ['selfie', 'aadhaar_front', 'aadhaar_back', 'pan', 'bank_proof'];

/** Only a motor vehicle needs a licence, a registration, insurance and a plate photo. */
const MOTOR_VEHICLE_DOCUMENTS: RiderDocumentKind[] = [
  'dl_front',
  'dl_back',
  'vehicle_rc',
  'vehicle_insurance',
  'vehicle_photo',
];

/**
 * Which `RiderDocumentKind`s `POST /rider/me/submit` requires before it
 * will move a rider to `under_review` — pure so it is trivially unit
 * tested against the onboarding brief's own table.
 *
 * **`ev_bike` is treated like `bicycle`.** The onboarding brief's
 * shorthand is "e-bike/scooter/motorcycle", but a sub-250W electric
 * cycle is legally a bicycle in India (no registration, no licence) —
 * unlike a real e-scooter, which the enum would spell `scooter`. Asking
 * for a DL and an RC nobody can produce would strand every e-cycle rider
 * at the submit screen with no way through.
 */
export function requiredDocumentKinds(vehicleType: VehicleType): RiderDocumentKind[] {
  const needsMotorDocuments = vehicleType === 'scooter' || vehicleType === 'motorcycle';
  return needsMotorDocuments ? [...BASE_DOCUMENTS, ...MOTOR_VEHICLE_DOCUMENTS] : BASE_DOCUMENTS;
}

/** `police_verification` is never self-uploaded — it is R4/admin territory (§8 Q10 is still open). */
export const SELF_UPLOADABLE_DOCUMENT_KINDS: RiderDocumentKind[] = [
  'selfie',
  'aadhaar_front',
  'aadhaar_back',
  'pan',
  'dl_front',
  'dl_back',
  'vehicle_rc',
  'vehicle_insurance',
  'vehicle_photo',
  'bank_proof',
];
