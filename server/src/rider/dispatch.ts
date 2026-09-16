import { Coords, distanceKm } from '../common/geo';
import { isCodBlocked } from './cash-ledger';

/**
 * Straight-line distance undercounts actual city roads — a kitchen and a
 * drop 2 km apart as the crow flies are rarely a 2 km ride on tricity
 * streets. `DeliveryJobsService.createForOrder` multiplies the haversine
 * distance by this before it is ever written to `DeliveryJob.distanceKm`
 * (see that column's own doc comment, which points back here). A real
 * routing API is the eventual fix; this is the placeholder until one is
 * wired in.
 */
export const ROAD_FACTOR = 1.3;

/**
 * Everything `rankCandidates` needs to know about one rider, already
 * resolved by the caller — this function never touches Prisma, so a test
 * builds these by hand instead of seeding a database.
 *
 * `zoneEligible` is deliberately a precomputed boolean rather than raw
 * zone geometry: D5's "within the job's zone circle **or** home zone =
 * job zone" needs the zone's centre/radius, and handing that shape to a
 * ranking function that also wants a plain distance sort is more coupling
 * than this file needs. `DispatchService` computes it once per candidate
 * with `zoneFor`/`distanceKm` and hands back the answer.
 */
export interface DispatchCandidate {
  riderId: string;
  approved: boolean;
  online: boolean;
  lastLat: number | null;
  lastLng: number | null;
  lastLocationAt: Date | null;
  /** Holding any job not yet `delivered/failed/returned/cancelled`. */
  hasActiveJob: boolean;
  /** Already has a `DeliveryOffer` row for *this* job — a decline must never loop back to the same rider. */
  alreadyOffered: boolean;
  /** Inside the job's zone circle, or this rider's own home zone. */
  zoneEligible: boolean;
  /** `SUM(RiderCashEntry.amount)` — rupees, same as everywhere else in this codebase. */
  cashBalance: number;
  cashLimit: number;
  /** Deliveries this rider has already completed today — the tie-break that spreads the work. */
  deliveriesToday: number;
}

export interface DispatchJob {
  pickupLat: number;
  pickupLng: number;
  /** Rupees. 0 or null means prepaid — the cash-limit check never applies to a prepaid job. */
  codAmount: number | null;
}

/** A rider's last fix older than this is not trusted for dispatch — they may have gone out of range or killed the app. */
export const LOCATION_STALE_SECONDS = 120;

/**
 * Every eligible rider for `job`, nearest first — D6's "one offer at a
 * time, nearest eligible online rider". Ties broken by fewest deliveries
 * today, so the same fast rider near the kitchen doesn't take every job
 * in a zone.
 *
 * Eligible = approved, online, a location fix within
 * `LOCATION_STALE_SECONDS`, holding no other active job, never already
 * offered this job, in the job's zone (or home-zoned to it), and — only
 * when the job actually carries cash — not already over their own cash
 * limit if this job's COD were added to it.
 */
export function rankCandidates(input: {
  job: DispatchJob;
  candidates: DispatchCandidate[];
  now: Date;
  staleAfterSeconds?: number;
}): string[] {
  const staleAfterMs = (input.staleAfterSeconds ?? LOCATION_STALE_SECONDS) * 1000;
  const codAmount = input.job.codAmount ?? 0;

  const eligible = input.candidates.filter((c) => {
    if (!c.approved || !c.online) return false;
    if (c.lastLat === null || c.lastLng === null || !c.lastLocationAt) return false;
    if (input.now.getTime() - c.lastLocationAt.getTime() > staleAfterMs) return false;
    if (c.hasActiveJob || c.alreadyOffered) return false;
    if (!c.zoneEligible) return false;
    // R3's cash-ledger.ts is the one place that knows "blocked" — this
    // checks the balance *this job would leave them at*, not merely
    // today's, and stays strict `>` (exactly at the limit is still fine).
    if (codAmount > 0 && isCodBlocked(c.cashBalance + codAmount, c.cashLimit)) return false;
    return true;
  });

  const pickup: Coords = { lat: input.job.pickupLat, lng: input.job.pickupLng };
  const distanceOf = (c: DispatchCandidate) => distanceKm(pickup, { lat: c.lastLat as number, lng: c.lastLng as number });

  return eligible
    .slice()
    .sort((a, b) => {
      const byDistance = distanceOf(a) - distanceOf(b);
      if (byDistance !== 0) return byDistance;
      return a.deliveriesToday - b.deliveriesToday;
    })
    .map((c) => c.riderId);
}
