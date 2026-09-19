import {
  CASHBACK_RATE,
  computeCashback,
  computeShipping,
} from '../../src/common/pricing/pricing.util';

/**
 * The flat 5% order cashback was switched off on 2026-09-19 (owner: "remove
 * cashback from wallet"). It is switched off by a **rate of 0, not by
 * deleting the function**, because the credit and reversal paths in
 * `OrdersService` read the stored `Order.cashbackEarned` snapshot, and an
 * order created before the switch still carries a non-zero one.
 *
 * This pins the switch itself: if somebody sets the rate back, every new
 * order quietly starts crediting the wallet again, and the only thing that
 * would notice is a buyer. The end-to-end half — a new order writes no
 * `cashback` ledger row on either payment path — is
 * `test/e2e/order-cashback-removed.e2e-spec.ts`.
 */
describe('order cashback is off', () => {
  it('has a rate of zero', () => {
    expect(CASHBACK_RATE).toBe(0);
  });

  it.each([0, 1, 250, 999, 1029, 12_345.67, 100_000])(
    'earns nothing on a ₹%s basket',
    (subtotal) => {
      // 5% of 1029 would have been ₹51 (Math.round(51.45)); that it is 0
      // now is the point.
      expect(computeCashback(subtotal)).toBe(0);
    },
  );

  it('leaves the delivery rule alone', () => {
    // Same file, same "server-authoritative money math" — the switch must
    // not have moved the shipping arithmetic beside it.
    const rule = { deliveryFee: 49, freeDeliveryThreshold: 999 };
    expect(computeShipping(998, rule)).toBe(49);
    expect(computeShipping(999, rule)).toBe(0);
    expect(computeShipping(0, rule)).toBe(0);
  });
});
