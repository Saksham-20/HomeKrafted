import {
  NO_COMMISSION,
  baseFromBuyerPrice,
  buyerPrice,
  markUp,
  markUpFactor,
} from '../../src/common/pricing/commission';

/** Expected values computed by hand (docs/TESTS.md rule), never recorded from a run. */
describe('markUp', () => {
  it('disabled: the buyer pays the base, and the applied rates record as 0', () => {
    expect(markUp(1000, NO_COMMISSION)).toEqual({
      base: 1000,
      commission: 0,
      gst: 0,
      buyerPrice: 1000,
      pct: 0,
      gstPct: 0,
    });
  });

  it('enabled, no GST configured: 20% of ₹1000 is ₹200 on top', () => {
    expect(markUp(1000, { pct: 20, gstPct: 0, enabled: true })).toEqual({
      base: 1000,
      commission: 200,
      gst: 0,
      buyerPrice: 1200,
      pct: 20,
      gstPct: 0,
    });
  });

  it('enabled with GST: 18% GST on the ₹200 fee is ₹36, buyer pays ₹1236', () => {
    expect(markUp(1000, { pct: 20, gstPct: 18, enabled: true })).toEqual({
      base: 1000,
      commission: 200,
      gst: 36,
      buyerPrice: 1236,
      pct: 20,
      gstPct: 18,
    });
  });

  it('0% commission means ₹0 GST and an applied GST rate of 0, even with GST configured', () => {
    expect(markUp(1000, { pct: 0, gstPct: 18, enabled: true })).toEqual({
      base: 1000,
      commission: 0,
      gst: 0,
      buyerPrice: 1000,
      pct: 0,
      gstPct: 0,
    });
  });

  it('zero charges nothing and applies no rate', () => {
    expect(markUp(0, { pct: 20, gstPct: 18, enabled: true })).toEqual({
      base: 0,
      commission: 0,
      gst: 0,
      buyerPrice: 0,
      pct: 0,
      gstPct: 0,
    });
  });

  it('a negative base (a corrupt row, not a price) passes through unchanged rather than being floored — the caller\'s own validation is what refuses it', () => {
    expect(markUp(-50, { pct: 20, gstPct: 18, enabled: true })).toEqual({
      base: -50,
      commission: 0,
      gst: 0,
      buyerPrice: -50,
      pct: 0,
      gstPct: 0,
    });
  });

  it('a non-finite base answers as ₹0 rather than propagating NaN', () => {
    expect(markUp(NaN, { pct: 20, gstPct: 18, enabled: true }).buyerPrice).toBe(0);
  });

  it('paise reconcile exactly: base + commission + gst === buyerPrice, to the paisa', () => {
    // 12.5% of ₹333.33 = ₹41.66625 → ₹41.67; 18% of ₹41.67 = ₹7.5006 → ₹7.50.
    const split = markUp(333.33, { pct: 12.5, gstPct: 18, enabled: true });
    expect(split.commission).toBe(41.67);
    expect(split.gst).toBe(7.5);
    expect(split.buyerPrice).toBe(382.5);
    expect(split.base + split.commission + split.gst).toBeCloseTo(split.buyerPrice, 2);
  });

  it('rounds a drifting float base before marking it up', () => {
    const split = markUp(100.005, { pct: 10, gstPct: 0, enabled: true });
    expect(split.base).toBe(100.01);
    expect(split.commission).toBe(10);
    expect(split.buyerPrice).toBe(110.01);
  });
});

describe('buyerPrice', () => {
  it('is the buyerPrice field of markUp, nothing more', () => {
    const rate = { pct: 15, gstPct: 18, enabled: true };
    expect(buyerPrice(500, rate)).toBe(markUp(500, rate).buyerPrice);
  });

  it('off means the buyer pays exactly the base', () => {
    expect(buyerPrice(500, NO_COMMISSION)).toBe(500);
  });
});

describe('markUpFactor', () => {
  it('disabled or 0%: the multiplier is 1', () => {
    expect(markUpFactor(NO_COMMISSION)).toBe(1);
    expect(markUpFactor({ pct: 0, gstPct: 18, enabled: true })).toBe(1);
  });

  it('20% commission + 18% GST on the fee compounds to 1.236', () => {
    // 1 + 0.20 * 1.18 = 1.236
    expect(markUpFactor({ pct: 20, gstPct: 18, enabled: true })).toBeCloseTo(1.236, 6);
  });

  it('a negative configured GST is floored at 0 rather than shrinking the factor below 1 + pct', () => {
    expect(markUpFactor({ pct: 10, gstPct: -50, enabled: true })).toBeCloseTo(1.1, 6);
  });
});

describe('baseFromBuyerPrice', () => {
  it('inverts markUpFactor for bounds/estimates — never exact to the paisa against markUp itself', () => {
    const rate = { pct: 20, gstPct: 18, enabled: true };
    // buyerPrice(1000, rate) === 1236 exactly; back-solving 1236 at the
    // same factor must recover the original base.
    expect(baseFromBuyerPrice(1236, rate)).toBe(1000);
  });

  it('off means the price is already the base', () => {
    expect(baseFromBuyerPrice(750, NO_COMMISSION)).toBe(750);
  });
});
