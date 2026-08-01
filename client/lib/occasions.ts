import type { Occasion } from "@/lib/types";

/**
 * Seasonal grouping for the occasion hub (M16, H8).
 *
 * **Every function here takes `now` as an argument.** It is never read
 * from `new Date()` inside, so a caller decides where the clock comes
 * from — which is what keeps this usable from a Server Component
 * (compute once, ship the HTML) without tripping CLAUDE.md's rule about
 * time-dependent values hydrating differently on the client. A component
 * that needs this in the browser passes its own `now` from an effect.
 */

/** Occasions are dated at day granularity; comparing at midnight stops "today" flipping to "yesterday" at 00:01. */
function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

const DAY_MS = 24 * 60 * 60 * 1000;

export function daysUntil(celebratedOn: string, now: Date): number {
  return Math.round((startOfDay(new Date(celebratedOn)) - startOfDay(now)) / DAY_MS);
}

export interface DatedOccasion {
  occasion: Occasion;
  days: number;
}

export interface OccasionSeasons {
  /** Dated and still ahead, soonest first. */
  upcoming: DatedOccasion[];
  /**
   * No date at all. A birthday has no season — listing it in a countdown
   * would be inventing an urgency it doesn't have.
   */
  evergreen: Occasion[];
  /**
   * Dated but already past. Kept out of both lists rather than hidden
   * entirely, so the hub can decide (it doesn't show them; an admin
   * rolling the date forward is what brings one back).
   */
  passed: DatedOccasion[];
}

export function groupOccasions(occasions: Occasion[], now: Date): OccasionSeasons {
  const upcoming: DatedOccasion[] = [];
  const evergreen: Occasion[] = [];
  const passed: DatedOccasion[] = [];

  for (const occasion of occasions) {
    if (!occasion.celebratedOn) {
      evergreen.push(occasion);
      continue;
    }
    const days = daysUntil(occasion.celebratedOn, now);
    // Zero is upcoming, not passed — an occasion is still an occasion on
    // the day it falls on, and that is the day people panic-buy.
    (days >= 0 ? upcoming : passed).push({ occasion, days });
  }

  upcoming.sort((a, b) => a.days - b.days);
  passed.sort((a, b) => b.days - a.days);
  evergreen.sort((a, b) => a.name.localeCompare(b.name));

  return { upcoming, evergreen, passed };
}

/**
 * How far ahead an occasion is worth putting on the home page.
 *
 * Six weeks is roughly when tricity festival gifting starts being
 * planned rather than remembered, and it is short enough that the banner
 * is not permanently occupied — a banner that is always there is
 * furniture, and nobody reads furniture.
 */
export const SEASONAL_BANNER_DAYS = 42;

/** The one occasion worth a home-page banner right now, if any. */
export function currentSeasonalOccasion(
  occasions: Occasion[],
  now: Date,
): DatedOccasion | undefined {
  const { upcoming } = groupOccasions(occasions, now);
  const next = upcoming[0];
  return next && next.days <= SEASONAL_BANNER_DAYS ? next : undefined;
}

/** "Today", "Tomorrow", "in 5 days", "in 3 weeks" — a countdown nobody has to do arithmetic on. */
export function countdownLabel(days: number): string {
  if (days <= 0) return "Today";
  if (days === 1) return "Tomorrow";
  if (days < 14) return `in ${days} days`;
  if (days < 60) {
    const weeks = Math.round(days / 7);
    return `in ${weeks} week${weeks === 1 ? "" : "s"}`;
  }
  const months = Math.round(days / 30.44);
  return `in ${months} month${months === 1 ? "" : "s"}`;
}
