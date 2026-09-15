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
