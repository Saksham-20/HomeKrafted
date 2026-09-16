import { requiredDocumentKinds } from '../../src/rider/required-documents';

describe('requiredDocumentKinds', () => {
  const BASE = ['selfie', 'aadhaar_front', 'aadhaar_back', 'pan', 'bank_proof'];
  const MOTOR_EXTRA = ['dl_front', 'dl_back', 'vehicle_rc', 'vehicle_insurance', 'vehicle_photo'];

  it('a bicycle rider only needs the base identity/bank set', () => {
    expect(requiredDocumentKinds('bicycle')).toEqual(BASE);
  });

  it('an ev_bike rider is treated exactly like a bicycle — no DL, no RC', () => {
    // A sub-250W electric cycle is legally a bicycle; asking for a
    // licence and registration nobody can produce would strand every
    // e-cycle rider at the submit screen.
    expect(requiredDocumentKinds('ev_bike')).toEqual(BASE);
  });

  it('a scooter rider needs the full motor-vehicle set on top of the base', () => {
    expect(requiredDocumentKinds('scooter')).toEqual([...BASE, ...MOTOR_EXTRA]);
  });

  it('a motorcycle rider needs the full motor-vehicle set on top of the base', () => {
    expect(requiredDocumentKinds('motorcycle')).toEqual([...BASE, ...MOTOR_EXTRA]);
  });
});
