import { markupBreakdown, sellerBaseFromCustomerPrice, type CommissionRate } from "./commission";

const OFF: CommissionRate = { pct: 20, gstPct: 18, enabled: false };
const RATE: CommissionRate = { pct: 20, gstPct: 18, enabled: true };

/** Expected values computed by hand (docs/TESTS.md rule), never recorded from a run. */
describe("markupBreakdown", () => {
  it("disabled: the customer pays exactly what the HomeKrafter typed", () => {
    expect(markupBreakdown(100, OFF)).toEqual({
      sellerWants: 100,
      commission: 0,
      gst: 0,
      customerPrice: 100,
    });
  });

  it("adds +20% commission and +18% GST on that fee: ₹100 → ₹20 fee → ₹3.60 GST → ₹123.60", () => {
    expect(markupBreakdown(100, RATE)).toEqual({
      sellerWants: 100,
      commission: 20,
      gst: 3.6,
      customerPrice: 123.6,
    });
  });

  it("handles decimal percentages with paisa rounding", () => {
    // 15% on ₹250 = ₹37.50; 18% GST on ₹37.50 = ₹6.75.
    expect(markupBreakdown(250, { pct: 15, gstPct: 18, enabled: true })).toEqual({
      sellerWants: 250,
      commission: 37.5,
      gst: 6.75,
      customerPrice: 294.25,
    });
  });

  it("at 0% commission passes through cleanly with no GST applied", () => {
    expect(markupBreakdown(100, { pct: 0, gstPct: 18, enabled: true })).toEqual({
      sellerWants: 100,
      commission: 0,
      gst: 0,
      customerPrice: 100,
    });
  });

  it("a non-positive or non-finite input answers ₹0 rather than propagating it", () => {
    expect(markupBreakdown(0, RATE).customerPrice).toBe(0);
    expect(markupBreakdown(NaN, RATE).customerPrice).toBe(0);
  });
});

describe("sellerBaseFromCustomerPrice", () => {
  it("deduces ₹100 from ₹123.60 at 20% + 18% GST on the fee", () => {
    expect(sellerBaseFromCustomerPrice(123.6, RATE)).toBe(100);
  });

  it("disabled: the price is already the base", () => {
    expect(sellerBaseFromCustomerPrice(120, OFF)).toBe(120);
  });
});
