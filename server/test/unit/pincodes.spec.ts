import {
  describePincode,
  isPincodeShape,
  lookupPincode,
  pincodeCount,
  seedCoordsForPincode,
  TRUSTWORTHY_SPREAD_KM,
} from '../../src/common/pincodes';

/**
 * The pincode table is a generated 1.8 MB blob, so the risks are not
 * "does this function work" but "did the table silently arrive empty,
 * truncated, or with its columns shifted". Every expectation below is a
 * fact about India, computed by hand, so a regenerated table that breaks
 * one of them fails the build rather than quietly mislocating kitchens.
 */
describe('pincode table', () => {
  it('is fully loaded, not an empty or truncated file', () => {
    // India Post publishes ~19,200 delivery pincodes. A build that copied
    // the .json badly, or a generator that stopped early, shows up here
    // rather than as "no pincode is recognised" in production.
    expect(pincodeCount()).toBeGreaterThan(19_000);
    expect(pincodeCount()).toBeLessThan(20_000);
  });

  it('places known pincodes in the right district and state', () => {
    expect(describePincode('160017')).toBe('Chandigarh, Chandigarh');
    expect(lookupPincode('134109')?.district).toBe('Panchkula');
    expect(lookupPincode('134109')?.state).toBe('Haryana');
    expect(lookupPincode('110001')?.state).toBe('Delhi');
  });

  it('puts coordinates in India, not in the Gulf of Guinea', () => {
    // The classic column-shift bug: lat and lng swapped, or parsed as 0.
    // India spans roughly 8–37 N and 68–97 E.
    for (const pin of ['160017', '110001', '600001', '781001', '695001']) {
      const record = lookupPincode(pin)!;
      expect(record.lat).toBeGreaterThan(6);
      expect(record.lat).toBeLessThan(38);
      expect(record.lng).toBeGreaterThan(67);
      expect(record.lng).toBeLessThan(98);
    }
  });

  describe('shape checking, which is a separate question from existence', () => {
    it('accepts six digits not starting with zero', () => {
      expect(isPincodeShape('160017')).toBe(true);
      expect(isPincodeShape(' 160017 ')).toBe(true);
    });

    it('rejects the shapes people actually mistype', () => {
      expect(isPincodeShape('16001')).toBe(false); // five digits
      expect(isPincodeShape('1600177')).toBe(false); // seven
      expect(isPincodeShape('060017')).toBe(false); // leading zero — no Indian pincode starts with 0
      expect(isPincodeShape('16001A')).toBe(false);
      expect(isPincodeShape('')).toBe(false);
    });

    it('treats a well-shaped pincode that does not exist as absent, not valid', () => {
      // Shape and existence must not be conflated: this passes the regex
      // and India Post has no such code, and the applicant needs to be
      // told the second thing, not the first.
      expect(isPincodeShape('999999')).toBe(true);
      expect(lookupPincode('999999')).toBeUndefined();
      expect(describePincode('999999')).toBeUndefined();
    });
  });

  describe('seed coordinates report their own reliability', () => {
    /**
     * The measurement this whole design rests on: GeoNames' centroid is
     * trustworthy for fewer than half of India's pincodes. If a future
     * table were accurate everywhere, `confident` would be true
     * everywhere and the admin confirmation step could go — but until
     * something proves that, `Vendor.lat`/`lng` must not be written from
     * a centroid unchecked.
     */
    it('flags a pincode whose post offices are far apart as approximate', () => {
      // 160055 spans Mohali and Rupnagar, ~45 km apart.
      const seed = seedCoordsForPincode('160055')!;
      expect(seed.spreadKm).toBeGreaterThan(TRUSTWORTHY_SPREAD_KM);
      expect(seed.trustworthy).toBe(false);
    });

    it('agrees with lookupPincode rather than holding a second copy', () => {
      const record = lookupPincode('160017')!;
      const seed = seedCoordsForPincode('160017')!;
      expect(seed.lat).toBe(record.lat);
      expect(seed.lng).toBe(record.lng);
      expect(seed.spreadKm).toBe(record.spreadKm);
    });

    it('has nothing to seed for a pincode that does not exist', () => {
      expect(seedCoordsForPincode('999999')).toBeUndefined();
    });
  });
});
