import * as pricingModule from "./pricing";
import { computeShipping, DEFAULT_DELIVERY_RULE, freeDeliveryHint } from "./pricing";

describe("computeShipping (delivery fee from settings, 2026-09-15)", () => {
  const rule = { deliveryFee: 49, freeDeliveryThreshold: 999 };

  it("charges the fee under the threshold and nothing at or above it", () => {
    expect(computeShipping(500, rule)).toBe(49);
    expect(computeShipping(999, rule)).toBe(0);
  });

  it("is free whenever the fee is zero — today's default", () => {
    expect(DEFAULT_DELIVERY_RULE.deliveryFee).toBe(0);
    expect(computeShipping(10, DEFAULT_DELIVERY_RULE)).toBe(0);
  });

  it("reads a zero threshold as no free-delivery offer", () => {
    expect(computeShipping(5000, { deliveryFee: 49, freeDeliveryThreshold: 0 })).toBe(49);
  });
});

describe("freeDeliveryHint", () => {
  it("names the threshold only when a fee is being charged and an offer exists", () => {
    expect(freeDeliveryHint({ deliveryFee: 49, freeDeliveryThreshold: 999 }, 49)).toBe(999);
    expect(freeDeliveryHint({ deliveryFee: 49, freeDeliveryThreshold: 999 }, 0)).toBeUndefined();
    expect(freeDeliveryHint({ deliveryFee: 49, freeDeliveryThreshold: 0 }, 49)).toBeUndefined();
    expect(freeDeliveryHint(undefined, 49)).toBeUndefined();
  });
});

describe("order cashback is not a client figure (removed 2026-09-19)", () => {
  it("exports no cashback rate or computation", () => {
    // The web checkout, the product page and the native checkout each
    // recomputed the flat 5% locally to print "earn ₹X cashback". The server
    // rate is 0 now (`server/src/common/pricing/pricing.util.ts`), so a
    // client that still computed one would promise a credit nobody pays.
    // Deleted rather than zeroed: a zeroed constant is one edit from being a
    // promise again, and an import that no longer resolves is a build error.
    expect(Object.keys(pricingModule).filter((name) => /cashback/i.test(name))).toEqual([]);
  });
});
