import { DeliveryZone, Rider, RiderDocument } from '@prisma/client';

/** Everything but the last 4 digits, for the list view and the default detail view. */
function maskAccountNumber(value: string | null): string | undefined {
  if (!value) return undefined;
  const last4 = value.slice(-4);
  return `${'•'.repeat(Math.max(value.length - 4, 0))}${last4}`;
}

export interface RiderContact {
  email: string | null;
  phone: string | null;
}

/** `GET /admin/riders` row — enough to triage the queue, none of the detail a click into the row is for. */
export function mapRiderSummary(rider: Rider, contact: RiderContact, zone: DeliveryZone | null) {
  return {
    id: rider.id,
    status: rider.status,
    fullName: rider.fullName ?? undefined,
    email: contact.email ?? undefined,
    phone: contact.phone ?? undefined,
    vehicleType: rider.vehicleType ?? undefined,
    zoneName: zone?.name,
    submittedAt: rider.submittedAt?.toISOString() ?? undefined,
    approvedAt: rider.approvedAt?.toISOString() ?? undefined,
    createdAt: rider.createdAt.toISOString(),
  };
}

/**
 * `GET /admin/riders/:id` — every field, because this is the panel
 * verifying them. `revealBank: true` (audited `?reveal=bank`, M16's
 * shape for a similarly sensitive field) is the only way the full
 * account number leaves masked.
 */
export function mapRiderDetail(
  rider: Rider & { documents: RiderDocument[] },
  contact: RiderContact,
  zone: DeliveryZone | null,
  revealBank: boolean,
) {
  return {
    id: rider.id,
    status: rider.status,
    statusNote: rider.statusNote ?? undefined,

    fullName: rider.fullName ?? undefined,
    dateOfBirth: rider.dateOfBirth?.toISOString().slice(0, 10) ?? undefined,
    gender: rider.gender ?? undefined,
    email: rider.email ?? contact.email ?? undefined,
    phone: contact.phone ?? undefined,
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
    bankAccountNumber: revealBank ? (rider.bankAccountNumber ?? undefined) : maskAccountNumber(rider.bankAccountNumber),
    bankIfsc: rider.bankIfsc ?? undefined,
    upiId: rider.upiId ?? undefined,

    tshirtSize: rider.tshirtSize ?? undefined,
    zoneId: rider.homeZoneId ?? undefined,
    zoneName: zone?.name,

    cashLimit: Number(rider.cashLimit),
    settlementMode: rider.settlementMode,

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
      reviewedAt: doc.reviewedAt?.toISOString() ?? undefined,
      uploadedAt: doc.uploadedAt.toISOString(),
    })),

    deliveredCount: rider.deliveredCount,
    rating: rider.rating !== null ? Number(rider.rating) : undefined,

    submittedAt: rider.submittedAt?.toISOString() ?? undefined,
    approvedAt: rider.approvedAt?.toISOString() ?? undefined,
    approvedById: rider.approvedById ?? undefined,
    isOnline: rider.isOnline,

    createdAt: rider.createdAt.toISOString(),
    updatedAt: rider.updatedAt.toISOString(),
  };
}

export function mapZone(zone: DeliveryZone) {
  return {
    id: zone.id,
    name: zone.name,
    city: zone.city,
    centerLat: zone.centerLat,
    centerLng: zone.centerLng,
    radiusKm: zone.radiusKm,
    isActive: zone.isActive,
    createdAt: zone.createdAt.toISOString(),
    updatedAt: zone.updatedAt.toISOString(),
  };
}
