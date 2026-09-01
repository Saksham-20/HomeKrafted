import { ConsignmentStatus, OrderStatus } from '@prisma/client';

/**
 * The carrier's vocabulary, mapped onto ours — the whole of it, in one
 * pure module with no clock, no Prisma and no config, so the mapping can
 * be asserted exhaustively in a unit test rather than discovered in
 * production at 2am (`server/test/unit/shadowfax-status.spec.ts`).
 *
 * Two things this file deliberately does **not** do:
 *
 * - **It never cancels or returns an order.** A carrier saying
 *   `cancelled_by_customer` or `rts_d` is telling us where a parcel went,
 *   not what should happen to the money. Cancellation refunds the buyer,
 *   reverses cashback and restocks (M15/M22); a return moves money too.
 *   Those are admin decisions with a person behind them, and a courier
 *   webhook is an unauthenticated-until-proven HTTP request. So the
 *   consignment records the truth and the order is left alone for the
 *   despatch queue to resolve.
 * - **It never moves an order backwards.** `orderStatusFor` returns the
 *   status this event *implies*; `ShippingService` still checks the order
 *   is actually behind that point before writing. A carrier replaying an
 *   old event must not un-deliver an order.
 */

/** Everything Shadowfax can send on a marketplace (seller-pickup) parcel. */
export type ShadowfaxStatusId =
  | 'new'
  | 'assigned_for_pickup'
  | 'assigned_for_seller_pickup'
  | 'ofp'
  | 'pickup_on_hold'
  | 'pickup_not_attempted'
  | 'seller_initiated_delay'
  | 'picked'
  | 'recd_at_rev_hub'
  | 'recd_at_fwd_hub'
  | 'recd_at_fwd_dc'
  | 'item_manifested'
  | 'bag_in_transit'
  | 'bag_received'
  | 'bag_received_at_via'
  | 'in_transit_return'
  // Present only in `tracking_details` (the poll), never in the PUSH
  // status tables — found by reading a real v4 track response.
  | 'recd_at_dc_rts'
  | 'rts_ofd'
  | 'pincode_updated'
  | 'item_misrouted'
  | 'assigned_for_delivery'
  | 'ofd'
  | 'delivered'
  | 'nc'
  | 'na'
  | 'cid'
  | 'on_hold'
  | 'reopen_ndr'
  | 'cancelled_by_customer'
  | 'cancelled_by_seller'
  | 'rts'
  | 'rts_in_process'
  | 'rts_d'
  | 'rts_nd'
  | 'rto'
  | 'rto_in_process'
  | 'rto_d'
  | 'rto_nd'
  | 'lost';

/**
 * Carrier status id -> our `ConsignmentStatus`.
 *
 * `exception` is the bucket for "still ours, still moving, but something
 * needs a human" — not contactable, on hold, delivery not attempted. It is
 * kept apart from `failed` (never booked) and `cancelled` (booking called
 * off) because those three want three different things done about them,
 * and the admin despatch queue filters on exactly that difference.
 */
const CONSIGNMENT_STATUS: Record<ShadowfaxStatusId, ConsignmentStatus> = {
  new: ConsignmentStatus.booked,
  assigned_for_pickup: ConsignmentStatus.out_for_pickup,
  assigned_for_seller_pickup: ConsignmentStatus.out_for_pickup,
  ofp: ConsignmentStatus.out_for_pickup,
  pickup_on_hold: ConsignmentStatus.exception,
  pickup_not_attempted: ConsignmentStatus.exception,
  seller_initiated_delay: ConsignmentStatus.exception,

  picked: ConsignmentStatus.picked,

  recd_at_rev_hub: ConsignmentStatus.in_transit,
  recd_at_fwd_hub: ConsignmentStatus.in_transit,
  recd_at_fwd_dc: ConsignmentStatus.in_transit,
  item_manifested: ConsignmentStatus.in_transit,
  bag_in_transit: ConsignmentStatus.in_transit,
  bag_received: ConsignmentStatus.in_transit,
  bag_received_at_via: ConsignmentStatus.in_transit,
  in_transit_return: ConsignmentStatus.returned,
  recd_at_dc_rts: ConsignmentStatus.returned,
  rts_ofd: ConsignmentStatus.returned,
  pincode_updated: ConsignmentStatus.in_transit,
  item_misrouted: ConsignmentStatus.exception,

  assigned_for_delivery: ConsignmentStatus.out_for_delivery,
  ofd: ConsignmentStatus.out_for_delivery,
  delivered: ConsignmentStatus.delivered,

  nc: ConsignmentStatus.exception,
  na: ConsignmentStatus.exception,
  cid: ConsignmentStatus.exception,
  on_hold: ConsignmentStatus.exception,
  reopen_ndr: ConsignmentStatus.exception,

  cancelled_by_customer: ConsignmentStatus.cancelled,
  cancelled_by_seller: ConsignmentStatus.cancelled,

  rts: ConsignmentStatus.returned,
  rts_in_process: ConsignmentStatus.returned,
  rts_d: ConsignmentStatus.returned,
  rts_nd: ConsignmentStatus.returned,
  rto: ConsignmentStatus.returned,
  rto_in_process: ConsignmentStatus.returned,
  rto_d: ConsignmentStatus.returned,
  rto_nd: ConsignmentStatus.returned,

  lost: ConsignmentStatus.failed,
};

/** Every id we know, for the exhaustiveness test and for the admin filter. */
export const SHADOWFAX_STATUS_IDS = Object.keys(CONSIGNMENT_STATUS) as ShadowfaxStatusId[];

export function isKnownShadowfaxStatus(id: string): id is ShadowfaxStatusId {
  return Object.prototype.hasOwnProperty.call(CONSIGNMENT_STATUS, id);
}

/**
 * `undefined` for a status id the carrier has invented since this file was
 * written. The caller stores the event anyway (the raw id is on the row)
 * and leaves the consignment's own status alone — an unknown word must
 * never be read as "delivered", and dropping the event would lose the only
 * record that the carrier said anything.
 */
export function consignmentStatusFor(courierStatus: string): ConsignmentStatus | undefined {
  return isKnownShadowfaxStatus(courierStatus) ? CONSIGNMENT_STATUS[courierStatus] : undefined;
}

/**
 * What this consignment status implies for the whole `Order`, or `null`
 * when it implies nothing.
 *
 * Only two rungs are ever driven by a carrier: `shipped` (the parcel has
 * left the kitchen) and `delivered` (it arrived). Everything else —
 * cancelled, returned, failed — is money, and money is not decided by a
 * webhook. See this file's header.
 */
export function orderStatusFor(status: ConsignmentStatus): OrderStatus | null {
  switch (status) {
    case ConsignmentStatus.picked:
    case ConsignmentStatus.in_transit:
    case ConsignmentStatus.out_for_delivery:
      return OrderStatus.shipped;
    case ConsignmentStatus.delivered:
      return OrderStatus.delivered;
    default:
      return null;
  }
}

/**
 * Where a status sits in the parcel's journey — used to decide whether an
 * event moves the row forward. A carrier redelivers old callbacks out of
 * order, so "latest received" is not "latest true".
 *
 * The terminal three share the top rank rather than ordering against each
 * other: a parcel is delivered *or* returned *or* cancelled, and there is
 * no sequence in which one follows another.
 */
const RANK: Record<ConsignmentStatus, number> = {
  [ConsignmentStatus.pending]: 0,
  [ConsignmentStatus.failed]: 0,
  [ConsignmentStatus.booked]: 1,
  [ConsignmentStatus.out_for_pickup]: 2,
  [ConsignmentStatus.picked]: 3,
  [ConsignmentStatus.in_transit]: 4,
  [ConsignmentStatus.out_for_delivery]: 5,
  [ConsignmentStatus.exception]: 5,
  [ConsignmentStatus.delivered]: 6,
  [ConsignmentStatus.returned]: 6,
  [ConsignmentStatus.cancelled]: 6,
};

export function statusRank(status: ConsignmentStatus): number {
  return RANK[status];
}

/**
 * Whether `next` should replace `current` on the row.
 *
 * `exception` is the exception, in both senses: it shares a rank with
 * out-for-delivery so that a snag on a parcel already out for delivery is
 * recorded, but it must never overwrite a terminal state — "not
 * contactable" arriving after "delivered" is a stale redelivery.
 */
export function advancesConsignment(current: ConsignmentStatus, next: ConsignmentStatus): boolean {
  if (current === next) return false;
  if (statusRank(current) >= 6) return false;
  return statusRank(next) >= statusRank(current);
}
