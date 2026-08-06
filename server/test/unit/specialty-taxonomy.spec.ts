import {
  categoryForSpecialties,
  supplyMix,
  vendorTypeForSpecialties,
} from '../../src/seller-applications/specialty-taxonomy';

/**
 * The apply form stopped asking applicants to classify themselves (M22),
 * so these derivations are now the only thing standing between "what I
 * make" and the columns that used to be typed in by hand. Every expected
 * value here is worked out from the rule, not recorded from a run.
 */
describe('supply taxonomy', () => {
  describe('categoryForSpecialties', () => {
    it('reads a food maker as a home chef', () => {
      expect(categoryForSpecialties(['pickles_preserves'])).toBe('home_chef');
      expect(categoryForSpecialties(['bakery', 'sweets'])).toBe('home_chef');
    });

    it('reads a craft maker as an artist, which had no honest answer before', () => {
      // The old enum's only non-food value was `crafts`, and the old
      // category question sent a candle maker to `other`.
      expect(categoryForSpecialties(['candles'])).toBe('artist');
      expect(categoryForSpecialties(['ceramics', 'jewellery'])).toBe('artist');
    });

    it('files somebody who does both under food', () => {
      // The food half carries the licensing and handling questions, so it
      // is the safer of the two to surface to an admin reviewing them.
      expect(categoryForSpecialties(['candles', 'homemade_food'])).toBe('home_chef');
    });

    it('says "other" rather than guessing when only a withdrawn module is named', () => {
      // `laundry`/`cleaning` are neither food nor craft. Letting one tip
      // the answer would file a legacy row as something it is not.
      expect(categoryForSpecialties(['laundry'])).toBe('other');
      expect(categoryForSpecialties([])).toBe('other');
    });

    it('treats the legacy `crafts` value as craft, since that is all it ever meant', () => {
      expect(categoryForSpecialties(['crafts'])).toBe('artist');
    });
  });

  describe('vendorTypeForSpecialties', () => {
    it('keeps a baker a baker', () => {
      expect(vendorTypeForSpecialties(['bakery'])).toBe('baker');
    });

    it('maps other food to maker and craft to artist', () => {
      expect(vendorTypeForSpecialties(['snacks'])).toBe('maker');
      expect(vendorTypeForSpecialties(['textiles'])).toBe('artist');
    });

    it('never returns undefined for a value the DTO accepts', () => {
      // `Vendor.type` is NOT NULL and this runs inside the approval
      // transaction — an unmapped value is a 500 on an admin clicking
      // approve, which is exactly how the old `as unknown as VendorType`
      // cast failed.
      const everyAccepted = [
        'homemade_food', 'bakery', 'pickles_preserves', 'snacks', 'sweets', 'beverages',
        'candles', 'ceramics', 'textiles', 'jewellery', 'art_prints', 'bath_body',
        'stationery', 'home_decor', 'personalised', 'crafts', 'laundry', 'cleaning',
      ] as const;
      for (const specialty of everyAccepted) {
        expect(vendorTypeForSpecialties([specialty])).toBeDefined();
      }
    });
  });

  describe('supplyMix', () => {
    it('reports both halves independently', () => {
      expect(supplyMix(['homemade_food', 'candles'])).toEqual({ makesFood: true, makesCraft: true });
      expect(supplyMix(['homemade_food'])).toEqual({ makesFood: true, makesCraft: false });
      expect(supplyMix(['candles'])).toEqual({ makesFood: false, makesCraft: true });
    });

    it('does not count the withdrawn module as craft', () => {
      // Otherwise a legacy laundry row would be shown a "what do you make"
      // profile aimed at makers, and — more to the point — would be asked
      // for an FSSAI licence or not on the strength of an unrelated value.
      expect(supplyMix(['laundry'])).toEqual({ makesFood: false, makesCraft: false });
    });
  });
});
