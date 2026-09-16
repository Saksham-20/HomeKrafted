import { ProductKind } from '@prisma/client';
import {
  EDIBLE_GIFT_DEPARTMENT_SLUG,
  isCourierEligible,
} from '../../src/shipping/courier-eligibility';

/**
 * D10 (owner, 2026-09-16): chocolates stay on the gifts side, and a courier
 * carries one only when its maker has said they pack it heat-safe.
 *
 * The rule this pins is the *direction of the default*. Every other
 * safety-ish flag in this codebase reads absence as "nobody was asked"
 * (`prepTimeMins`, `dietary`, `workingDays`), and so does this one — the
 * difference is what "we were not told" then costs. Here it costs a local
 * delivery; the other way it costs a bag of melted chocolate arriving as
 * somebody's gift, and a refund a home maker pays for.
 */
const shelf = (slug: string, parentSlug?: string) => ({
  category: { slug, parent: parentSlug ? { slug: parentSlug } : null },
});

describe('a courier and an edible gift', () => {
  it('carries an ordinary craft listing, as it always has', () => {
    expect(
      isCourierEligible({ kind: ProductKind.craft, categories: [shelf('scented-jar-candles', 'candles-and-lighting')] }),
    ).toBe(true);
  });

  it('never carries food, whatever else is true of it', () => {
    expect(isCourierEligible({ kind: ProductKind.food, heatSafePacked: true })).toBe(false);
  });

  it('refuses an edible gift nobody has answered for', () => {
    // The fourteen live chocolate listings on the day D10 was decided.
    expect(
      isCourierEligible({ kind: ProductKind.craft, categories: [shelf(EDIBLE_GIFT_DEPARTMENT_SLUG)] }),
    ).toBe(false);
  });

  it('carries an edible gift once the maker marks it packed heat-safe', () => {
    expect(
      isCourierEligible({
        kind: ProductKind.craft,
        heatSafePacked: true,
        categories: [shelf(EDIBLE_GIFT_DEPARTMENT_SLUG)],
      }),
    ).toBe(true);
  });

  it('reads a subcategory of the department, not only the department itself', () => {
    const truffles = { category: { slug: 'chocolates', parent: { slug: EDIBLE_GIFT_DEPARTMENT_SLUG } } };
    expect(isCourierEligible({ kind: ProductKind.craft, categories: [truffles] })).toBe(false);
    expect(
      isCourierEligible({ kind: ProductKind.craft, heatSafePacked: true, categories: [truffles] }),
    ).toBe(true);
  });

  it('refuses when an edible shelf is one of several the listing sits on', () => {
    // A hamper filed under both Hampers and Chocolates is still a parcel
    // with chocolate in it. `ProductCategory` carries every shelf (M58),
    // so the check has to look at all of them rather than the primary.
    expect(
      isCourierEligible({
        kind: ProductKind.craft,
        categories: [shelf('festive-hampers', 'hampers-and-gift-sets'), shelf(EDIBLE_GIFT_DEPARTMENT_SLUG)],
      }),
    ).toBe(false);
  });

  it('carries a craft listing whose shelves were not loaded, rather than refusing everything', () => {
    // Callers that never select `categories` are asking a question this
    // rule cannot answer. They get the pre-D10 behaviour, which is what
    // every one of them was written against — and `ensureConsignments`,
    // the one caller that books a real parcel, does select them.
    expect(isCourierEligible({ kind: ProductKind.craft })).toBe(true);
  });
});
