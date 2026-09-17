import { OrderDeliveryMode } from '@prisma/client';

/**
 * Hand-delivery to the ISB campus — the one place that decides what that
 * means (2026-09-17, owner).
 *
 * The owner's brief: a buyer at ISB picks "Deliver to ISB", pays no
 * delivery cost, and Homekrafted carries the parcel onto campus itself as
 * soon as the maker has packed it. Everything going anywhere else is a
 * courier job, and the courier keys are not live yet
 * (`SHADOWFAX_ENABLED`, `docs/DEPLOY.md`), so this is also the one
 * delivery path that works end to end today without a carrier account.
 *
 * Three rules, and each is a thing that would otherwise be spoofable or
 * silently wrong:
 *
 * - **The server owns the destination, not the request.** A campus order
 *   ships to `ISB_CAMPUS_ADDRESS` — the same lines every time, written by
 *   `resolveCampusAddress`, ignoring whatever `defaultAddressId` or
 *   per-item address the client sent. Otherwise "free delivery, we carry
 *   it" is claimable for an address in another state: the buyer pays no
 *   fee, no courier is booked, and the order simply never moves.
 * - **The fee is zero whatever the platform charges.** `deliveryFee` is
 *   an admin setting that happens to be 0 today; a campus order must stay
 *   free the day somebody sets it to 40, because "no delivery cost" is
 *   the offer, not a side effect of the current rule.
 * - **A campus order is never handed to a courier.** `ShippingService`
 *   books a parcel when a kitchen marks a gift packed; for these it books
 *   nothing and records nothing — not a `failed` consignment either,
 *   because nothing failed. The kitchen marks it packed, we collect it,
 *   and the order is closed by hand, exactly like the food half (M57).
 */

/** The label the buyer's saved ISB address carries, so the book holds one of them, not one per order. */
export const ISB_ADDRESS_LABEL = 'ISB campus';

/**
 * The campus, as the person carrying the parcel needs it written.
 *
 * Fixed in code rather than typed by the buyer, and deliberately not a
 * `Vendor`-style coordinate: nothing computes a distance from it. The
 * buyer supplies only the part we cannot know — which building, floor or
 * room to hand it over at, which lands in `line2`.
 */
export const ISB_CAMPUS_ADDRESS = {
  line1: 'Indian School of Business, Knowledge City',
  city: 'Mohali',
  state: 'Punjab',
  pincode: '140306',
  country: 'India',
} as const;

/** What a buyer types: "AC4, room 212", "Exec housing block B". */
export const CAMPUS_DROP_MAX_LENGTH = 120;

export function isCampusDelivery(mode: OrderDeliveryMode | null | undefined): boolean {
  return mode === OrderDeliveryMode.isb_campus;
}

/**
 * The request's `deliveryMode` string as the enum.
 *
 * The wire value is `isb-campus` and the Prisma enum member is
 * `isb_campus` (`@map`), so comparing a request value against the enum
 * directly is a comparison that can never be true — it compiles, it
 * typechecks, and every campus order quietly becomes a standard one with
 * a delivery fee and a courier booking. Parse once, here.
 */
export function deliveryModeFromWire(value: string | null | undefined): OrderDeliveryMode {
  return value === 'isb-campus' ? OrderDeliveryMode.isb_campus : OrderDeliveryMode.standard;
}

/**
 * The delivery fee for one order.
 *
 * Takes the already-computed standard fee rather than the settings, so
 * this file never needs to know how the platform prices delivery — only
 * that a campus order is free of it.
 */
export function campusAwareShippingFee(mode: OrderDeliveryMode, standardFee: number): number {
  return isCampusDelivery(mode) ? 0 : standardFee;
}

/**
 * What the order screens say about how it gets there.
 *
 * Copy lives beside the rule so a second surface cannot invent a
 * different promise — and it says "as soon as it is packed" rather than a
 * date, because the maker's packing is the only event anybody can predict
 * (the M51 rule: never claim what the data does not say).
 */
export const CAMPUS_DELIVERY_NOTE =
  'Delivered by hand on the ISB campus, free, as soon as the maker has packed it.';
