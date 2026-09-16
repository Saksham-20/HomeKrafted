import { zoneFor, ZoneCircle } from '../../src/rider/zones';

/**
 * `zoneFor` — R1's dispatch-zone lookup (the D5 circles). Real tricity
 * coordinates, same fixtures `geo.spec.ts` and `TRICITY_AREAS` use.
 */

const SECTOR_17 = { lat: 30.7418, lng: 76.7822 }; // Chandigarh Central
const SECTOR_43 = { lat: 30.7154, lng: 76.758 }; // Chandigarh South
const ZIRAKPUR = { lat: 30.6425, lng: 76.8173 }; // ~11 km from Sector 17

const CENTRAL: ZoneCircle = { id: 'z1', centerLat: SECTOR_17.lat, centerLng: SECTOR_17.lng, radiusKm: 6, isActive: true };
const SOUTH: ZoneCircle = { id: 'z2', centerLat: SECTOR_43.lat, centerLng: SECTOR_43.lng, radiusKm: 6, isActive: true };

describe('zoneFor', () => {
  it('resolves a point at a zone’s own centre to that zone', () => {
    expect(zoneFor(SECTOR_17, [CENTRAL, SOUTH])?.id).toBe('z1');
  });

  it('picks the nearer of two overlapping circles', () => {
    // Sector 17 and Sector 43 are ~3.2km apart — well inside both 6km
    // circles, so a point near Sector 43 has to resolve to South, not
    // whichever zone happens to come first in the array.
    expect(zoneFor(SECTOR_43, [CENTRAL, SOUTH])?.id).toBe('z2');
  });

  it('returns null for a point outside every circle', () => {
    // Zirakpur is ~11km from Sector 17 — outside a 6km Chandigarh Central
    // circle with no other zone defined.
    expect(zoneFor(ZIRAKPUR, [CENTRAL])).toBeNull();
  });

  it('never resolves to an inactive zone', () => {
    const closedCentral: ZoneCircle = { ...CENTRAL, isActive: false };
    expect(zoneFor(SECTOR_17, [closedCentral])).toBeNull();
  });

  it('returns null with no zones at all', () => {
    expect(zoneFor(SECTOR_17, [])).toBeNull();
  });
});
