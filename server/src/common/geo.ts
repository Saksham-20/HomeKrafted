/**
 * Distance helpers for the "show me what's near me" filter.
 *
 * Homekrafted launches in the Chandigarh tricity, where the whole service
 * area fits inside roughly 30 km. At that scale plain haversine on a sphere
 * is accurate to a few metres — far below the precision of the coordinates
 * we actually hold (an area centroid, not a doorstep) — so there's no case
 * for anything heavier.
 *
 * Filtering happens in application code rather than SQL because Postgres
 * here has no PostGIS and the candidate set is small (one row per
 * HomeKrafter). If the vendor count ever reaches the thousands, move this
 * to a bounding-box `WHERE` on lat/lng first and keep haversine only as the
 * exact second pass.
 */

const EARTH_RADIUS_KM = 6371;

export interface Coords {
  lat: number;
  lng: number;
}

const toRadians = (deg: number): number => (deg * Math.PI) / 180;

/** Great-circle distance in kilometres between two points. */
export function distanceKm(a: Coords, b: Coords): number {
  const dLat = toRadians(b.lat - a.lat);
  const dLng = toRadians(b.lng - a.lng);
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);

  const h =
    Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
}

/** Rounded for display — one decimal under 10 km, whole numbers above. */
export function formatDistanceKm(km: number): string {
  return km < 10 ? `${km.toFixed(1)} km` : `${Math.round(km)} km`;
}

/**
 * Is `kitchen` willing and close enough to serve `buyer`?
 *
 * The radius belongs to the kitchen, not the buyer — a HomeKrafter who only
 * delivers within their own sector sets 3 km, one who ships across the
 * tricity sets 25 km, and each is respected independently.
 */
export function isWithinDelivery(buyer: Coords, kitchen: Coords, radiusKm: number): boolean {
  return distanceKm(buyer, kitchen) <= radiusKm;
}

/**
 * The tricity areas a buyer can pick when they decline the browser location
 * prompt, and the centroid each one resolves to.
 *
 * These double as the areas a HomeKrafter chooses when applying, so a
 * kitchen and a buyer who pick the same area always resolve to the same
 * point and therefore to distance 0. Coordinates are area centroids —
 * good to a few hundred metres, which is the right precision for "is this
 * kitchen near me", and deliberately not a precise home address.
 */
export const TRICITY_AREAS: { id: string; label: string; city: string; lat: number; lng: number }[] = [
  // --- Chandigarh -------------------------------------------------------
  { id: 'chd-sector-8', label: 'Sector 8', city: 'Chandigarh', lat: 30.7419, lng: 76.7906 },
  { id: 'chd-sector-15', label: 'Sector 15', city: 'Chandigarh', lat: 30.7594, lng: 76.7681 },
  { id: 'chd-sector-17', label: 'Sector 17', city: 'Chandigarh', lat: 30.7418, lng: 76.7822 },
  { id: 'chd-sector-22', label: 'Sector 22', city: 'Chandigarh', lat: 30.7333, lng: 76.7794 },
  { id: 'chd-sector-32', label: 'Sector 32', city: 'Chandigarh', lat: 30.7218, lng: 76.7677 },
  { id: 'chd-sector-34', label: 'Sector 34', city: 'Chandigarh', lat: 30.7196, lng: 76.7601 },
  { id: 'chd-sector-35', label: 'Sector 35', city: 'Chandigarh', lat: 30.7266, lng: 76.7554 },
  { id: 'chd-sector-43', label: 'Sector 43', city: 'Chandigarh', lat: 30.7154, lng: 76.7580 },
  { id: 'chd-sector-46', label: 'Sector 46', city: 'Chandigarh', lat: 30.7083, lng: 76.7626 },
  { id: 'chd-manimajra', label: 'Manimajra', city: 'Chandigarh', lat: 30.7280, lng: 76.8380 },
  // --- Mohali (SAS Nagar) ----------------------------------------------
  { id: 'moh-phase-3b2', label: 'Phase 3B2', city: 'Mohali', lat: 30.7050, lng: 76.7180 },
  { id: 'moh-phase-5', label: 'Phase 5', city: 'Mohali', lat: 30.7020, lng: 76.7100 },
  { id: 'moh-phase-7', label: 'Phase 7', city: 'Mohali', lat: 30.7130, lng: 76.7020 },
  { id: 'moh-sector-70', label: 'Sector 70', city: 'Mohali', lat: 30.6940, lng: 76.7220 },
  { id: 'moh-kharar', label: 'Kharar', city: 'Mohali', lat: 30.7460, lng: 76.6470 },
  // --- Panchkula --------------------------------------------------------
  { id: 'pkl-sector-5', label: 'Sector 5', city: 'Panchkula', lat: 30.6930, lng: 76.8540 },
  { id: 'pkl-sector-9', label: 'Sector 9', city: 'Panchkula', lat: 30.6870, lng: 76.8480 },
  { id: 'pkl-sector-11', label: 'Sector 11', city: 'Panchkula', lat: 30.6790, lng: 76.8560 },
  { id: 'pkl-sector-20', label: 'Sector 20', city: 'Panchkula', lat: 30.6620, lng: 76.8420 },
  // --- Zirakpur ---------------------------------------------------------
  { id: 'zkp-vip-road', label: 'VIP Road', city: 'Zirakpur', lat: 30.6425, lng: 76.8173 },
  { id: 'zkp-dhakoli', label: 'Dhakoli', city: 'Zirakpur', lat: 30.6600, lng: 76.8300 },
];

/** Centre of the tricity — the fallback "everything" origin. */
export const TRICITY_CENTRE: Coords = { lat: 30.7333, lng: 76.7794 };

export function areaById(id: string) {
  return TRICITY_AREAS.find((a) => a.id === id);
}

/** Nearest known area to a raw browser coordinate — used to label a GPS fix. */
export function nearestArea(coords: Coords) {
  return TRICITY_AREAS.reduce((best, area) =>
    distanceKm(coords, area) < distanceKm(coords, best) ? area : best,
  );
}
