import { commissionBreakdown, markupBreakdown, priceForTarget, sellerBaseFromCustomerPrice } from "./commission";

/** Expected values computed by hand (docs/TESTS.md rule), never recorded from a run. */
describe("commissionBreakdown", () => {
  it("10% of ₹450 is ₹45, leaving ₹405", () => {
    expect(commissionBreakdown(450, 10)).toEqual({ gross: 450, commission: 45, net: 405 });
  });

  it("reconciles to the paisa on an awkward rate", () => {
    // 12.5% of ₹333.33 = ₹41.66625 → ₹41.67; net = 333.33 − 41.67.
    expect(commissionBreakdown(333.33, 12.5)).toEqual({
      gross: 333.33,
      commission: 41.67,
      net: 291.66,
    });
  });

  it("a 0% rate passes the price through untouched", () => {
    expect(commissionBreakdown(250, 0)).toEqual({ gross: 250, commission: 0, net: 250 });
  });
});

describe("priceForTarget", () => {
  it("inverts the breakdown: to take home ₹405 at 10%, list at ₹450", () => {
    expect(priceForTarget(405, 10)).toBe(450);
  });

  it("ceils so the take-home is never under the target", () => {
    // 300 / 0.9 = 333.33… → ₹334; at ₹334 the net is ₹300.60 ≥ ₹300.
    expect(priceForTarget(300, 10)).toBe(334);
    expect(commissionBreakdown(334, 10).net).toBeGreaterThanOrEqual(300);
  });

  it("a 100% rate has no finite answer", () => {
    expect(priceForTarget(100, 100)).toBe(Infinity);
  });
});

describe("markupBreakdown", () => {
  it("adds +20% on ₹100 to make customer price ₹120", () => {
    expect(markupBreakdown(100, 20)).toEqual({
      sellerWants: 100,
      commission: 20,
      customerPrice: 120,
    });
  });

  it("handles decimal percentages with paisa rounding", () => {
    // 15% on ₹250 = ₹37.50 → customer price ₹287.50
    expect(markupBreakdown(250, 15)).toEqual({
      sellerWants: 250,
      commission: 37.5,
      customerPrice: 287.5,
    });
  });

  it("at 0% commission passes through cleanly", () => {
    expect(markupBreakdown(100, 0)).toEqual({
      sellerWants: 100,
      commission: 0,
      customerPrice: 100,
    });
  });
});

describe("sellerBaseFromCustomerPrice", () => {
  it("deduces ₹100 from ₹120 customer price at 20%", () => {
    expect(sellerBaseFromCustomerPrice(120, 20)).toBe(100);
  });
});

