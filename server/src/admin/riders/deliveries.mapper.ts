import { DeliveryJob, DeliveryOffer, DeliveryProof, DeliveryZone, Rider, RiderLocationPing, Vendor, VendorProfile, Address, Seller, User } from '@prisma/client';

/**
 * The admin projection of a `DeliveryJob` — deliberately not
 * `rider-jobs.mapper.ts`. An admin is one of M36b's original two
 * surfaces for `VendorProfile.pickup*`, so this file reads the pickup
 * address and the buyer's address/phone directly and without a status
 * gate: an operator resolving a dispute needs the whole picture,
 * whatever step the job stopped at.
 */

type SummaryRow = DeliveryJob & {
  vendor: Pick<Vendor, 'name'>;
  address: Pick<Address, 'city'>;
  zone: Pick<DeliveryZone, 'name'> | null;
  rider: (Pick<Rider, 'id'> & { user: Pick<User, 'name'> }) | null;
};

export function mapDeliverySummary(job: SummaryRow) {
  return {
    id: job.id,
    jobNumber: job.jobNumber,
    status: job.status,
    vendorName: job.vendor.name,
    dropCity: job.address.city,
    zoneName: job.zone?.name,
    riderId: job.rider?.id,
    riderName: job.rider?.user.name,
    codAmount: job.codAmount ? Number(job.codAmount) : undefined,
    pay: job.totalPay ? Number(job.totalPay) : undefined,
    createdAt: job.createdAt.toISOString(),
  };
}

type DetailRow = DeliveryJob & {
  vendor: Vendor & { profile: VendorProfile | null; seller: (Seller & { user: Pick<User, 'phone'> }) | null };
  address: Address;
  zone: Pick<DeliveryZone, 'name'> | null;
  rider: (Rider & { user: Pick<User, 'name'> }) | null;
};

type OfferRow = DeliveryOffer & { rider: Rider & { user: Pick<User, 'name'> } };

export function mapDeliveryDetail(
  job: DetailRow,
  proofs: DeliveryProof[],
  offers: OfferRow[],
  pings: RiderLocationPing[],
) {
  const profile = job.vendor.profile;

  return {
    id: job.id,
    jobNumber: job.jobNumber,
    status: job.status,
    orderId: job.orderId,
    vendor: { id: job.vendorId, name: job.vendor.name },

    pickup: {
      addressLine1: profile?.pickupAddressLine1 ?? undefined,
      addressLine2: profile?.pickupAddressLine2 ?? undefined,
      landmark: profile?.pickupLandmark ?? undefined,
      pincode: profile?.pickupPincode ?? undefined,
      phone: profile?.pickupPhone ?? job.vendor.seller?.user.phone ?? undefined,
      lat: job.pickupLat,
      lng: job.pickupLng,
    },
    drop: {
      recipientName: job.address.recipientName,
      addressLine1: job.address.line1,
      addressLine2: job.address.line2 ?? undefined,
      city: job.address.city,
      pincode: job.address.pincode,
      phone: job.address.phone,
      instructions: job.address.instructions ?? undefined,
      lat: job.dropLat,
      lng: job.dropLng,
    },

    zoneName: job.zone?.name,
    distanceKm: job.distanceKm ?? undefined,
    codAmount: job.codAmount ? Number(job.codAmount) : undefined,
    deliveryOtp: job.deliveryOtp ?? undefined,
    otpAttempts: job.otpAttempts,

    pay: {
      basePay: job.basePay ? Number(job.basePay) : undefined,
      distancePay: job.distancePay ? Number(job.distancePay) : undefined,
      waitPay: job.waitPay ? Number(job.waitPay) : undefined,
      incentivePay: job.incentivePay ? Number(job.incentivePay) : undefined,
      totalPay: job.totalPay ? Number(job.totalPay) : undefined,
    },

    rider: job.rider ? { id: job.rider.id, name: job.rider.user.name, vehicleType: job.rider.vehicleType ?? undefined } : undefined,

    offeredAt: job.offeredAt?.toISOString(),
    acceptedAt: job.acceptedAt?.toISOString(),
    arrivedPickupAt: job.arrivedPickupAt?.toISOString(),
    pickedUpAt: job.pickedUpAt?.toISOString(),
    arrivedDropAt: job.arrivedDropAt?.toISOString(),
    deliveredAt: job.deliveredAt?.toISOString(),
    cancelReason: job.cancelReason ?? undefined,
    failureReason: job.failureReason ?? undefined,

    proofs: proofs.map((p) => ({ id: p.id, stage: p.stage, url: p.url, lat: p.lat ?? undefined, lng: p.lng ?? undefined, takenAt: p.takenAt.toISOString() })),
    offers: offers.map((o) => ({
      id: o.id,
      riderId: o.riderId,
      riderName: o.rider.user.name,
      status: o.status,
      offeredAt: o.offeredAt.toISOString(),
      expiresAt: o.expiresAt.toISOString(),
      respondedAt: o.respondedAt?.toISOString(),
    })),
    pings: pings.map((p) => ({ lat: p.lat, lng: p.lng, accuracyM: p.accuracyM ?? undefined, recordedAt: p.recordedAt.toISOString() })),

    createdAt: job.createdAt.toISOString(),
    updatedAt: job.updatedAt.toISOString(),
  };
}
