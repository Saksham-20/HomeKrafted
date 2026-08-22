import {
  activeDiscountPct,
  applyDiscount,
  MAX_VENDOR_DISCOUNT_PCT,
} from '../../src/catalog/vendor-discount';

/**
 * The discount is the HomeKrafter's own money coming off their own
 * listings, so the interesting cases are all the ones where it should
 * *not* apply, or should apply less than asked.
 */
describe('activeDiscountPct', () => {
  const now = new Date('2026-08-22T10:00:00.000Z');

  it('is zero when nothing is set', () => {
    expect(activeDiscountPct({ discountPct: null, discountEndsAt: null }, now)).toBe(0);
  });

  it('is zero for a discount below the worth-showing floor', () => {
    expect(activeDiscountPct({ discountPct: 0, discountEndsAt: null }, now)).toBe(0);
  });

  it('applies with no end date — "always 10% off" is a real thing to run', () => {
    expect(activeDiscountPct({ discountPct: 10, discountEndsAt: null }, now)).toBe(10);
  });

  it('applies while the end date is still ahead', () => {
    const ends = new Date('2026-08-23T00:00:00.000Z');
    expect(activeDiscountPct({ discountPct: 15, discountEndsAt: ends }, now)).toBe(15);
  });

  it('stops at the end date, which is exclusive', () => {
    expect(activeDiscountPct({ discountPct: 15, discountEndsAt: now }, now)).toBe(0);
  });

  it('stops after the end date', () => {
    const ends = new Date('2026-08-21T00:00:00.000Z');
    expect(activeDiscountPct({ discountPct: 15, discountEndsAt: ends }, now)).toBe(0);
  });

  it('caps a stored value above the ceiling rather than trusting it', () => {
    expect(activeDiscountPct({ discountPct: 95, discountEndsAt: null }, now)).toBe(
      MAX_VENDOR_DISCOUNT_PCT,
    );
  });
});

describe('applyDiscount', () => {
  it('leaves a price alone at zero percent', () => {
    expect(applyDiscount(249, 0)).toBe(249);
  });

  it('rounds to the nearest rupee rather than flooring', () => {
    // 249 × 0.9 = 224.1 → 224; 245 × 0.9 = 220.5 → 221 (round-half-up).
    expect(applyDiscount(249, 10)).toBe(224);
    expect(applyDiscount(245, 10)).toBe(221);
  });

  it('never returns more than it was given', () => {
    expect(applyDiscount(100, -50)).toBe(100);
  });

  it('never returns a negative price', () => {
    expect(applyDiscount(10, 200)).toBe(5);
  });

  it('respects the ceiling even if a caller passes more', () => {
    expect(applyDiscount(200, 90)).toBe(100);
  });
});
