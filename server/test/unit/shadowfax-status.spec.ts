import { ConsignmentStatus, OrderStatus } from '@prisma/client';
import {
  advancesConsignment,
  consignmentStatusFor,
  isKnownShadowfaxStatus,
  orderStatusFor,
  SHADOWFAX_STATUS_IDS,
  statusRank,
} from '../../src/shipping/shadowfax-status';

/**
 * The carrier vocabulary map. Every assertion here is a rule that, if it
 * broke, would break silently — a parcel quietly stuck, or an order
 * marked delivered by a webhook that had no business saying so.
 */
describe('shadowfax status mapping', () => {
  it('maps every documented marketplace status id', () => {
    // The full set from the Unified API's "Marketplace order states for
    // PUSH Api" table. A carrier id missing from our map is a parcel that
    // silently stops moving, so the list is written out rather than
    // derived from the map it is checking.
    const documented = [
      'assigned_for_pickup',
      'assigned_for_seller_pickup',
      'ofp',
      'picked',
      'recd_at_rev_hub',
      'recd_at_fwd_hub',
      'recd_at_fwd_dc',
      'ofd',
      'assigned_for_delivery',
      'delivered',
      'cid',
      'nc',
      'na',
      'pickup_not_attempted',
      'pickup_on_hold',
      'reopen_ndr',
      'cancelled_by_customer',
      'rts',
      'rts_in_process',
      'rts_d',
      'rts_nd',
      'lost',
      'on_hold',
      'seller_initiated_delay',
      'cancelled_by_seller',
    ];
    for (const id of documented) {
      expect(isKnownShadowfaxStatus(id)).toBe(true);
      expect(consignmentStatusFor(id)).toBeDefined();
    }
  });

  it('returns undefined for a status the carrier has invented since', () => {
    // Must be `undefined`, not a default. A default of anything at all is
    // a new carrier word being read as a state we act on.
    expect(consignmentStatusFor('wormhole_transit')).toBeUndefined();
    expect(consignmentStatusFor('')).toBeUndefined();
    expect(consignmentStatusFor('__proto__')).toBeUndefined();
    expect(consignmentStatusFor('constructor')).toBeUndefined();
  });

  it('never lets a carrier callback cancel, return or fail an order', () => {
    // The rule this whole module is built around: a callback is the
    // least-authenticated input the server accepts (Shadowfax does not
    // sign bodies), so the most it may do is move a parcel forward.
    // Cancellation and returns move money and are an admin's decision.
    const moneyMoving: ConsignmentStatus[] = [
      ConsignmentStatus.cancelled,
      ConsignmentStatus.returned,
      ConsignmentStatus.failed,
      ConsignmentStatus.exception,
    ];
    for (const status of moneyMoving) {
      expect(orderStatusFor(status)).toBeNull();
    }
  });

  it('drives only shipped and delivered', () => {
    expect(orderStatusFor(ConsignmentStatus.picked)).toBe(OrderStatus.shipped);
    expect(orderStatusFor(ConsignmentStatus.in_transit)).toBe(OrderStatus.shipped);
    expect(orderStatusFor(ConsignmentStatus.out_for_delivery)).toBe(OrderStatus.shipped);
    expect(orderStatusFor(ConsignmentStatus.delivered)).toBe(OrderStatus.delivered);
    // A parcel merely booked or collected-from has not shipped anything.
    expect(orderStatusFor(ConsignmentStatus.booked)).toBeNull();
    expect(orderStatusFor(ConsignmentStatus.out_for_pickup)).toBeNull();
    expect(orderStatusFor(ConsignmentStatus.pending)).toBeNull();
  });

  it('every mapped status has a rank', () => {
    for (const id of SHADOWFAX_STATUS_IDS) {
      const mapped = consignmentStatusFor(id);
      expect(mapped).toBeDefined();
      expect(Number.isFinite(statusRank(mapped as ConsignmentStatus))).toBe(true);
    }
  });

  describe('advancesConsignment', () => {
    it('moves forward', () => {
      expect(advancesConsignment(ConsignmentStatus.booked, ConsignmentStatus.picked)).toBe(true);
      expect(advancesConsignment(ConsignmentStatus.picked, ConsignmentStatus.delivered)).toBe(true);
    });

    it('never moves backwards — carriers redeliver callbacks out of order', () => {
      expect(advancesConsignment(ConsignmentStatus.out_for_delivery, ConsignmentStatus.picked)).toBe(false);
      expect(advancesConsignment(ConsignmentStatus.delivered, ConsignmentStatus.in_transit)).toBe(false);
    });

    it('never leaves a terminal state', () => {
      // A stale "not contactable" arriving after a delivery must not
      // un-deliver a parcel — measured happening before this guard.
      for (const terminal of [ConsignmentStatus.delivered, ConsignmentStatus.returned, ConsignmentStatus.cancelled]) {
        for (const next of Object.values(ConsignmentStatus)) {
          expect(advancesConsignment(terminal, next)).toBe(false);
        }
      }
    });

    it('treats delivered/returned/cancelled as rank 6, which is what freezes their metadata', () => {
      // `ShippingService.ingest` refuses to rewrite a row at this rank.
      // The bug that pins: a carrier event stamped a day *after* a
      // delivery is legitimately "newest", and without the rank check it
      // rewrote the row to `status=delivered, courierStatus=ofd`.
      expect(statusRank(ConsignmentStatus.delivered)).toBeGreaterThanOrEqual(6);
      expect(statusRank(ConsignmentStatus.returned)).toBeGreaterThanOrEqual(6);
      expect(statusRank(ConsignmentStatus.cancelled)).toBeGreaterThanOrEqual(6);
      expect(statusRank(ConsignmentStatus.out_for_delivery)).toBeLessThan(6);
      expect(statusRank(ConsignmentStatus.exception)).toBeLessThan(6);
    });

    it('is not a no-op change', () => {
      expect(advancesConsignment(ConsignmentStatus.picked, ConsignmentStatus.picked)).toBe(false);
    });

    it('records an exception on a live parcel', () => {
      expect(advancesConsignment(ConsignmentStatus.in_transit, ConsignmentStatus.exception)).toBe(true);
    });
  });
});
