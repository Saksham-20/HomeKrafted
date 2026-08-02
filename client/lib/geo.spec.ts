import {
  TRICITY_AREAS,
  TRICITY_CENTRE,
  areaById,
  areasByCity,
  distanceKm,
  formatDistanceKm,
  nearestArea,
} from "@/lib/geo";

/**
 * Distance decides what a visitor sees on `/shop` and `/snacks`, so a
 * quiet error here reorders the whole catalogue without anything looking
 * broken. The cross-package check that this table still matches
 * `server/src/common/geo.ts` lives in `server/test/unit/geo-parity.spec.ts`
 * — it has to run from one side or the other, and the server is where a
 * kitchen's coordinates are stamped.
 */

const SECTOR_17 = { lat: 30.7418, lng: 76.7822 };
const SECTOR_34 = { lat: 30.7196, lng: 76.7601 };

describe("distanceKm", () => {
  it("is zero for a point against itself", () => {
    expect(distanceKm(SECTOR_17, SECTOR_17)).toBe(0);
  });

  it("matches a hand-checked tricity distance", () => {
    // Sector 17 to Sector 34 is a little over 3 km on the ground.
    expect(distanceKm(SECTOR_17, SECTOR_34)).toBeCloseTo(3.2, 1);
  });

  it("is symmetric", () => {
    expect(distanceKm(SECTOR_17, SECTOR_34)).toBeCloseTo(distanceKm(SECTOR_34, SECTOR_17), 10);
  });

  it("scales correctly over a long span", () => {
    // Chandigarh to Delhi is ~240 km great-circle (the road is ~250).
    expect(distanceKm(SECTOR_17, { lat: 28.6139, lng: 77.209 })).toBeCloseTo(240.2, 0);
  });

  it("handles a degree of latitude as ~111 km", () => {
    expect(distanceKm({ lat: 30, lng: 76 }, { lat: 31, lng: 76 })).toBeCloseTo(111.2, 0);
  });
});

describe("formatDistanceKm", () => {
  it("keeps one decimal under 10 km, where the difference is walkable", () => {
    expect(formatDistanceKm(0.4)).toBe("0.4 km");
    expect(formatDistanceKm(3.24)).toBe("3.2 km");
    expect(formatDistanceKm(9.8)).toBe("9.8 km");
  });

  it("rounds to whole numbers from 10 km up", () => {
    // The switch is on the value, not the rendered string, so 10 exactly
    // is already in the whole-number branch.
    expect(formatDistanceKm(10)).toBe("10 km");
    expect(formatDistanceKm(23.6)).toBe("24 km");
  });
});

describe("TRICITY_AREAS", () => {
  it("has unique ids", () => {
    // A duplicate id makes `areaById` return the wrong point for whichever
    // area lost the race.
    const ids = TRICITY_AREAS.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("sits inside the tricity, not somewhere in the Bay of Bengal", () => {
    // A transposed lat/lng is the classic geo bug and looks like a normal
    // number until it is plotted.
    for (const area of TRICITY_AREAS) {
      expect(area.lat).toBeGreaterThan(30.5);
      expect(area.lat).toBeLessThan(31);
      expect(area.lng).toBeGreaterThan(76.4);
      expect(area.lng).toBeLessThan(77);
      expect(distanceKm(area, TRICITY_CENTRE)).toBeLessThan(25);
    }
  });

  it("names only the four tricity cities", () => {
    expect(new Set(TRICITY_AREAS.map((a) => a.city))).toEqual(
      new Set(["Chandigarh", "Mohali", "Panchkula", "Zirakpur"]),
    );
  });
});

describe("areaById / nearestArea / areasByCity", () => {
  it("finds a known area and returns undefined for a stale id", () => {
    // Area ids ride in the `hk_loc` cookie, so a removed area will be
    // presented by real browsers long after it is gone.
    expect(areaById("chd-sector-17")?.label).toBe("Sector 17");
    expect(areaById("chd-sector-999")).toBeUndefined();
  });

  it("resolves a raw GPS fix to the closest named area", () => {
    expect(nearestArea({ lat: 30.7419, lng: 76.7823 }).id).toBe("chd-sector-17");
    expect(nearestArea({ lat: 30.6425, lng: 76.8173 }).id).toBe("zkp-vip-road");
  });

  it("always returns an area, even for a fix far outside the tricity", () => {
    // Location is never a gate: someone opening the site from Mumbai gets
    // a nearest area and the full catalogue, not an error.
    expect(nearestArea({ lat: 19.076, lng: 72.8777 })).toBeDefined();
  });

  it("groups the picker by city in a fixed order, with no empty groups", () => {
    const groups = areasByCity();
    expect(groups.map((g) => g.city)).toEqual([
      "Chandigarh",
      "Mohali",
      "Panchkula",
      "Zirakpur",
    ]);
    expect(groups.every((g) => g.areas.length > 0)).toBe(true);
    expect(groups.reduce((n, g) => n + g.areas.length, 0)).toBe(TRICITY_AREAS.length);
  });
});
