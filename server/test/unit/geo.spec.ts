import { TRICITY_AREAS, areaById, distanceKm, isWithinDelivery, nearestArea } from '../../src/common/geo';

/**
 * The server's own copy of the distance helpers. The area *table* is
 * checked against the client's in `geo-parity.spec.ts`; this covers the
 * one function that only exists here — `isWithinDelivery`, which decides
 * whether a kitchen appears for a buyer at all.
 */

const SECTOR_17 = { lat: 30.7418, lng: 76.7822 };
const SECTOR_34 = { lat: 30.7196, lng: 76.7601 };

describe('distanceKm', () => {
  it('agrees with a hand-checked tricity distance', () => {
    expect(distanceKm(SECTOR_17, SECTOR_17)).toBe(0);
    expect(distanceKm(SECTOR_17, SECTOR_34)).toBeCloseTo(3.2, 1);
  });

  it('spans the whole service area in well under 30 km', () => {
    // The premise the plain-haversine choice rests on. If this ever fails,
    // the "no PostGIS needed" reasoning needs revisiting, not the test.
    const far = Math.max(
      ...TRICITY_AREAS.flatMap((a) => TRICITY_AREAS.map((b) => distanceKm(a, b))),
    );
    expect(far).toBeLessThan(30);
  });
});

describe('isWithinDelivery', () => {
  it('respects the kitchen radius, not a platform-wide one', () => {
    // A HomeKrafter who only delivers within their sector sets 3 km; one
    // who ships across the tricity sets 25. Both are honoured.
    expect(isWithinDelivery(SECTOR_17, SECTOR_34, 3)).toBe(false);
    expect(isWithinDelivery(SECTOR_17, SECTOR_34, 25)).toBe(true);
  });

  it('includes a buyer sitting exactly on the boundary', () => {
    const exact = distanceKm(SECTOR_17, SECTOR_34);
    expect(isWithinDelivery(SECTOR_17, SECTOR_34, exact)).toBe(true);
  });

  it('always serves a buyer who picked the same area as the kitchen', () => {
    // The reason both tables carry area centroids: same area must mean
    // distance 0, so even a 1 km radius includes them.
    for (const area of TRICITY_AREAS) {
      expect(isWithinDelivery(area, area, 1)).toBe(true);
    }
  });
});

describe('areaById / nearestArea', () => {
  it('resolves a known id and rejects a stale one', () => {
    expect(areaById('chd-sector-17')?.label).toBe('Sector 17');
    expect(areaById('nope')).toBeUndefined();
  });

  it('labels any coordinate, including one outside the tricity', () => {
    expect(nearestArea(SECTOR_34).id).toBe('chd-sector-34');
    expect(nearestArea({ lat: 19.076, lng: 72.8777 })).toBeDefined();
  });
});
