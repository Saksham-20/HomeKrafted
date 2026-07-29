/**
 * Buyer-side distance helpers, mirroring `server/src/common/geo.ts`.
 *
 * The area table is duplicated rather than imported because `client/` and
 * `server/` are separate packages with no shared build. It must stay in
 * step with the server copy: a HomeKrafter's kitchen coordinates come from
 * the server's table when their application is approved, and a buyer's
 * picked area comes from this one. If the two drifted, a buyer and a
 * kitchen in the same sector would resolve to different points and the
 * distance filter would quietly mis-sort.
 */

const EARTH_RADIUS_KM = 6371;

export interface Coords {
  lat: number;
  lng: number;
}

const toRadians = (deg: number): number => (deg * Math.PI) / 180;

/** Great-circle distance in kilometres. */
export function distanceKm(a: Coords, b: Coords): number {
  const dLat = toRadians(b.lat - a.lat);
  const dLng = toRadians(b.lng - a.lng);
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
}

/** One decimal under 10 km, whole numbers above. */
export function formatDistanceKm(km: number): string {
  return km < 10 ? `${km.toFixed(1)} km` : `${Math.round(km)} km`;
}

export interface TricityArea {
  id: string;
  label: string;
  city: string;
  lat: number;
  lng: number;
}

export const TRICITY_AREAS: TricityArea[] = [
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

/** Centre of the tricity — the "show me everything" fallback origin. */
export const TRICITY_CENTRE: Coords = { lat: 30.7333, lng: 76.7794 };

export function areaById(id: string): TricityArea | undefined {
  return TRICITY_AREAS.find((a) => a.id === id);
}

/** Nearest known area to a raw GPS fix, so a coordinate can be shown as a place name. */
export function nearestArea(coords: Coords): TricityArea {
  return TRICITY_AREAS.reduce((best, area) =>
    distanceKm(coords, area) < distanceKm(coords, best) ? area : best,
  );
}

/** Areas grouped by city, for the picker's option groups. */
export function areasByCity(): { city: string; areas: TricityArea[] }[] {
  const order = ["Chandigarh", "Mohali", "Panchkula", "Zirakpur"];
  return order
    .map((city) => ({ city, areas: TRICITY_AREAS.filter((a) => a.city === city) }))
    .filter((g) => g.areas.length > 0);
}
