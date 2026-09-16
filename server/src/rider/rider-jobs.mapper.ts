import { DeliveryOffer } from '@prisma/client';
import { distanceKm } from '../common/geo';
import type { JobWithRelations } from './rider-jobs.types';

/**
 * Every shape a `DeliveryJob` is projected into, for every audience that
 * is allowed to see one at all.
 *
 * **The privacy boundary this file exists to hold** (the R2 cross-cutting
 * rule, docs/RIDER-APP.md §10): a rider sees the pickup address only for
 * a job they hold `accepted`/`at_pickup`, and the buyer's address/phone
 * only `picked_up`/`at_drop`. History responses carry area labels only.
 * This is a **third** surface for `VendorProfile.pickup*`
 * (CLAUDE.md's M36b names two: the admin verification panel and a
 * HomeKrafter's own portal) — narrower than either, because it is gated
 * by a job's live status rather than by who is asking.
 *
 * Everything above the `PRIVATE` marker below may read an area label
 * (`zone.name`, `Vendor.location`, `Address.area`/`city` — all already
 * public elsewhere) and nothing sharper. Only `mapActiveJobForRider`,
 * below the marker, may read a pickup address line, a pickup phone, or a
 * buyer's `line1`/`line2`/`phone`/`recipientName`/`instructions` — and it
 * gates each by the job's own `status`. `rider-address-privacy.spec.ts`
 * fails the build if any of those names appear above the marker.
 */

function firstName(fullName: string): string {
  const first = fullName.trim().split(/\s+/)[0];
  return first || fullName;
}

/**
 * Coarse enough for a rider deciding whether to accept, or for a job's
 * own history row — never a street. Exported for R3's
 * `mapEarningsJobForRider` below (`GET /rider/earnings`'s "areas only"
 * rule is the same one `mapJobHistoryForRider` already follows).
 */
export function pickupArea(job: JobWithRelations): string {
  return job.zone?.name ?? job.vendor.location;
}

export function dropArea(job: JobWithRelations): string {
  return job.address.area ?? job.address.city;
}

/**
 * `GET /rider/offers/current` — §2.3's "Offer" row: areas and distances,
 * pay, COD if any, the 45s ring. `riderPos` is the rider's own last known
 * fix (or `null` if they have none yet), so "distance to pickup" is
 * computed once here rather than trusted from anywhere else.
 */
export function mapOfferForRider(offer: DeliveryOffer, job: JobWithRelations, riderPos: { lat: number; lng: number } | null) {
  const distanceToPickupKm = riderPos
    ? Math.round(distanceKm(riderPos, { lat: job.pickupLat, lng: job.pickupLng }) * 10) / 10
    : undefined;

  return {
    id: offer.id,
    jobId: job.id,
    status: offer.status,
    expiresAt: offer.expiresAt.toISOString(),
    pickupArea: pickupArea(job),
    distanceToPickupKm,
    dropArea: dropArea(job),
    routeDistanceKm: job.distanceKm ?? undefined,
    codAmount: job.codAmount ? Number(job.codAmount) : undefined,
    pay: job.totalPay ? Number(job.totalPay) : undefined,
  };
}

/** `GET /rider/jobs?page` — a rider's own history. Area labels only, no address, no OTP, no buyer/chef phone. */
export function mapJobHistoryForRider(job: JobWithRelations) {
  return {
    id: job.id,
    jobNumber: job.jobNumber,
    status: job.status,
    pickupArea: pickupArea(job),
    dropArea: dropArea(job),
    distanceKm: job.distanceKm ?? undefined,
    codAmount: job.codAmount ? Number(job.codAmount) : undefined,
    pay: job.totalPay ? Number(job.totalPay) : undefined,
    offeredAt: job.offeredAt?.toISOString(),
    acceptedAt: job.acceptedAt?.toISOString(),
    arrivedPickupAt: job.arrivedPickupAt?.toISOString(),
    pickedUpAt: job.pickedUpAt?.toISOString(),
    arrivedDropAt: job.arrivedDropAt?.toISOString(),
    deliveredAt: job.deliveredAt?.toISOString(),
    cancelReason: job.cancelReason ?? undefined,
    failureReason: job.failureReason ?? undefined,
    createdAt: job.createdAt.toISOString(),
  };
}

/**
 * `GET /rider/earnings?from&to` — R3's per-job pay breakdown. Same
 * "areas only" rule as `mapJobHistoryForRider`, narrowed further to what
 * the brief actually asks for: the pay columns, `deliveredAt`,
 * `jobNumber`, and the two area labels.
 */
export function mapEarningsJobForRider(job: JobWithRelations) {
  return {
    jobNumber: job.jobNumber,
    pickupArea: pickupArea(job),
    dropArea: dropArea(job),
    basePay: job.basePay ? Number(job.basePay) : 0,
    distancePay: job.distancePay ? Number(job.distancePay) : 0,
    waitPay: job.waitPay ? Number(job.waitPay) : 0,
    incentivePay: job.incentivePay ? Number(job.incentivePay) : 0,
    totalPay: job.totalPay ? Number(job.totalPay) : 0,
    deliveredAt: job.deliveredAt ? job.deliveredAt.toISOString() : undefined,
  };
}

/**
 * `GET /orders/:id`'s `delivery` field, for the buyer. `otp` is the
 * fallback proof of delivery, so it is shown only before the job is
 * actually delivered — after that it has nothing left to prove.
 */
export function mapDeliveryForBuyer(job: JobWithRelations) {
  return {
    status: job.status,
    riderFirstName: job.rider ? firstName(job.rider.user.name) : undefined,
    otp: job.status === 'delivered' ? undefined : (job.deliveryOtp ?? undefined),
  };
}

/** `GET /seller/orders/:id/delivery` — rider identity and status, deliberately no phone (D14 — that is the rider's line to the buyer, not the kitchen's). */
export function mapDeliveryForSeller(job: JobWithRelations) {
  return {
    status: job.status,
    riderFirstName: job.rider ? firstName(job.rider.user.name) : undefined,
    vehicleType: job.rider?.vehicleType ?? undefined,
  };
}

// ---------------------------------------------------------------------
// PRIVATE — nothing above this line may read a pickup-address column or
// a buyer's address/phone. `mapActiveJobForRider` is the one place that
// may, and only for the two status windows §2.3/D13/D14 name.
// ---------------------------------------------------------------------

/**
 * `GET /rider/jobs/active` — the job a rider is currently carrying, with
 * exactly the detail the step they're on needs and nothing from a step
 * they've already left.
 *
 * `pickup` is present only while `status` is `accepted`/`at_pickup` — it
 * disappears the moment the parcel is picked up, per D13 ("only while
 * the job is active"). `drop` is present only once `picked_up`/`at_drop`
 * — a rider does not need the buyer's door before they have the parcel.
 * `deliveryOtp` is never included here at all: the code is the buyer's
 * own proof, read out to the rider, never read *by* the rider from the
 * app.
 */
export function mapActiveJobForRider(job: JobWithRelations) {
  const showPickup = job.status === 'accepted' || job.status === 'at_pickup';
  const showDrop = job.status === 'picked_up' || job.status === 'at_drop';
  const profile = job.vendor.profile;

  return {
    id: job.id,
    jobNumber: job.jobNumber,
    status: job.status,
    distanceKm: job.distanceKm ?? undefined,
    codAmount: job.codAmount ? Number(job.codAmount) : undefined,
    pay: job.totalPay ? Number(job.totalPay) : undefined,
    offeredAt: job.offeredAt?.toISOString(),
    acceptedAt: job.acceptedAt?.toISOString(),
    arrivedPickupAt: job.arrivedPickupAt?.toISOString(),
    pickedUpAt: job.pickedUpAt?.toISOString(),
    arrivedDropAt: job.arrivedDropAt?.toISOString(),

    pickup: showPickup
      ? {
          vendorName: job.vendor.name,
          addressLine1: profile?.pickupAddressLine1 ?? undefined,
          addressLine2: profile?.pickupAddressLine2 ?? undefined,
          landmark: profile?.pickupLandmark ?? undefined,
          pincode: profile?.pickupPincode ?? undefined,
          phone: profile?.pickupPhone ?? job.vendor.seller?.user.phone ?? undefined,
          lat: job.pickupLat,
          lng: job.pickupLng,
        }
      : undefined,

    drop: showDrop
      ? {
          recipientFirstName: firstName(job.address.recipientName),
          addressLine1: job.address.line1,
          addressLine2: job.address.line2 ?? undefined,
          city: job.address.city,
          pincode: job.address.pincode,
          instructions: job.address.instructions ?? undefined,
          phone: job.address.phone,
          lat: job.dropLat,
          lng: job.dropLng,
        }
      : undefined,
  };
}
