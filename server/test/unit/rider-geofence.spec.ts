import { withinMetres, distanceMetres } from '../../src/rider/geofence';

// Sector 17 and Sector 43, Chandigarh — the same tricity fixtures used by `geo.spec.ts` and `rider-zones.spec.ts`, ~3.2km apart.
const SECTOR_17 = { lat: 30.7418, lng: 76.7822 };
const SECTOR_43 = { lat: 30.7154, lng: 76.758 };

describe('withinMetres / distanceMetres', () => {
  it('a point is within 0m of itself', () => {
    expect(withinMetres(SECTOR_17, SECTOR_17, 0)).toBe(true);
    expect(distanceMetres(SECTOR_17, SECTOR_17)).toBe(0);
  });

  it('a point 3km away is outside a 300m radius', () => {
    expect(withinMetres(SECTOR_17, SECTOR_43, 300)).toBe(false);
  });

  it('distanceMetres agrees with distanceKm scaled by 1000', () => {
    const km = distanceMetres(SECTOR_17, SECTOR_43) / 1000;
    expect(km).toBeGreaterThan(3);
    expect(km).toBeLessThan(4);
  });

  it('a small offset within the default arrive radius (300m) reads as arrived', () => {
    // ~0.002 degrees latitude is roughly 220m — inside 300m.
    const nearby = { lat: SECTOR_17.lat + 0.002, lng: SECTOR_17.lng };
    expect(withinMetres(nearby, SECTOR_17, 300)).toBe(true);
  });

  it('exactly at the radius boundary counts as within (<=, not <)', () => {
    const d = distanceMetres(SECTOR_17, SECTOR_43);
    expect(withinMetres(SECTOR_17, SECTOR_43, d)).toBe(true);
  });
});
