import { Coords, distanceKm } from '../common/geo';

/**
 * A dispatch zone, as the pure functions here need it — not the full
 * Prisma `DeliveryZone` row, so a caller can pass a DB row or a plain
 * object in a test without a cast.
 */
export interface ZoneCircle {
  id: string;
  centerLat: number;
  centerLng: number;
  radiusKm: number;
  isActive: boolean;
}

/**
 * The nearest zone whose circle actually contains `point`, or `null`.
 *
 * D5: zones are circles (centre + radius), not polygons — cheap to
 * evaluate and an admin can draw one by typing a centre. "Nearest zone"
 * only matters when two circles overlap (a kitchen near the seam between
 * Chandigarh Central and Manimajra, say); the point still has to be
 * *inside* a circle to resolve to it at all — being closer to a zone's
 * centre than to any other zone's centre is not the same as being
 * serviceable, which is why this is a filter-then-sort rather than a
 * bare nearest-centre lookup.
 *
 * Inactive zones never match — same reasoning as every other
 * `isActive`/`moderationStatus` gate in this codebase: an admin who
 * closes a zone must not have it silently keep resolving jobs into it.
 */
export function zoneFor(point: Coords, zones: ZoneCircle[]): ZoneCircle | null {
  const containing = zones.filter(
    (zone) => zone.isActive && distanceKm(point, { lat: zone.centerLat, lng: zone.centerLng }) <= zone.radiusKm,
  );
  if (containing.length === 0) return null;

  return containing.reduce((nearest, zone) =>
    distanceKm(point, { lat: zone.centerLat, lng: zone.centerLng }) <
    distanceKm(point, { lat: nearest.centerLat, lng: nearest.centerLng })
      ? zone
      : nearest,
  );
}
