import { Prisma, Rider, RiderDocument } from '@prisma/client';
import { requiredDocumentKinds } from './required-documents';

/**
 * `GET /rider/me`'s shape — the rider's own, unmasked view of their own
 * application. Unlike the admin surface (`src/admin/riders/riders.mapper.ts`,
 * which masks bank details), there is nothing here to hide from the
 * person it belongs to.
 */
export function mapOwnRider(
  rider: Rider & { documents: RiderDocument[] },
  cashBalance: Prisma.Decimal,
) {
  const uploadedKinds = new Set(rider.documents.map((d) => d.kind));
  // Empty until `vehicleType` is chosen — asking for documents before the
  // vehicle question is answered would show a checklist nobody can
  // interpret yet.
  const required = rider.vehicleType ? requiredDocumentKinds(rider.vehicleType) : [];

  return {
    id: rider.id,
    status: rider.status,
    statusNote: rider.statusNote ?? undefined,

    fullName: rider.fullName ?? undefined,
    dateOfBirth: rider.dateOfBirth?.toISOString().slice(0, 10) ?? undefined,
    gender: rider.gender ?? undefined,
    email: rider.email ?? undefined,
    homeLine1: rider.homeLine1 ?? undefined,
    homeLine2: rider.homeLine2 ?? undefined,
    homeCity: rider.homeCity ?? undefined,
    homePincode: rider.homePincode ?? undefined,
    languages: rider.languages,

    emergencyName: rider.emergencyName ?? undefined,
    emergencyRelation: rider.emergencyRelation ?? undefined,
    emergencyPhone: rider.emergencyPhone ?? undefined,

    vehicleType: rider.vehicleType ?? undefined,
    vehicleNumber: rider.vehicleNumber ?? undefined,
    dlNumber: rider.dlNumber ?? undefined,
    dlExpiry: rider.dlExpiry?.toISOString().slice(0, 10) ?? undefined,

    aadhaarLast4: rider.aadhaarLast4 ?? undefined,
    panNumber: rider.panNumber ?? undefined,

    bankAccountName: rider.bankAccountName ?? undefined,
    bankAccountNumber: rider.bankAccountNumber ?? undefined,
    bankIfsc: rider.bankIfsc ?? undefined,
    upiId: rider.upiId ?? undefined,

    tshirtSize: rider.tshirtSize ?? undefined,
    homeZoneId: rider.homeZoneId ?? undefined,

    consents: {
      agreementVersion: rider.agreementVersion ?? undefined,
      agreementAcceptedAt: rider.agreementAcceptedAt?.toISOString() ?? undefined,
      privacyVersion: rider.privacyVersion ?? undefined,
      privacyAcceptedAt: rider.privacyAcceptedAt?.toISOString() ?? undefined,
      locationConsentAt: rider.locationConsentAt?.toISOString() ?? undefined,
      bgvConsentAt: rider.bgvConsentAt?.toISOString() ?? undefined,
    },

    documents: rider.documents.map((doc) => ({
      kind: doc.kind,
      status: doc.status,
      note: doc.note ?? undefined,
      uploadedAt: doc.uploadedAt.toISOString(),
    })),
    /** What `POST /rider/me/submit` will refuse on right now. */
    missingDocuments: required.filter((kind) => !uploadedKinds.has(kind)),

    cash: {
      // `Number()` on a `Decimal` the same way every other money mapper
      // in this codebase does — the wire format is JSON, which has no
      // decimal type, and rupees-with-two-places never approaches
      // float's precision loss at these amounts.
      balance: Number(cashBalance),
      limit: Number(rider.cashLimit),
      settlementMode: rider.settlementMode,
    },

    deliveredCount: rider.deliveredCount,
    rating: rider.rating !== null ? Number(rider.rating) : undefined,

    submittedAt: rider.submittedAt?.toISOString() ?? undefined,
    approvedAt: rider.approvedAt?.toISOString() ?? undefined,
    isOnline: rider.isOnline,

    createdAt: rider.createdAt.toISOString(),
    updatedAt: rider.updatedAt.toISOString(),
  };
}

export type OwnRiderView = ReturnType<typeof mapOwnRider>;
