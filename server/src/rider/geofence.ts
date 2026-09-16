import { Coords, distanceKm } from '../common/geo';

/**
 * Is `a` within `metres` of `b`? The "Arrived at pickup"/"Arrived" gate
 * (§2.3): a rider can only record arrival once they are actually close,
 * `rider.arriveRadiusM` (300, placeholder) close. Pure and unit-tested —
 * `distanceKm` already is, this is just the metre conversion the caller
 * wants.
 */
export function withinMetres(a: Coords, b: Coords, metres: number): boolean {
  return distanceMetres(a, b) <= metres;
}

/** Straight-line distance in metres — what the refusal sentence ("You are 1.2 km from the kitchen…") is built from. */
export function distanceMetres(a: Coords, b: Coords): number {
  return distanceKm(a, b) * 1000;
}
