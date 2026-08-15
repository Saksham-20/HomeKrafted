import { parseTimeLabel } from './meal-brackets';

/**
 * When a delivery date's menu closes (M37).
 *
 * The product rule: a date's menu — and a buyer's ability to skip that
 * date — locks at `menuLockTime` **the evening before**, so the kitchen
 * plans tomorrow against a list that stops moving. The time is a
 * platform setting (`PlatformSettings.menuLockTime`, default 20:00); the
 * timezone is IST, fixed at UTC+5:30 — India has no DST, so a constant
 * offset is exact, and pulling in a timezone library for one offset
 * would be the wrong trade.
 *
 * Same discipline as everything else in this directory: **no function
 * here reads the clock.** Callers pass `now`, which is what lets a spec
 * drive this with hand-picked instants and lets a Server Component
 * compute lock state once without a hydration mismatch (the M12 React
 * #418 lesson).
 */

export const DEFAULT_MENU_LOCK_TIME = '20:00';

/** India Standard Time, minutes east of UTC. No DST — a constant is exact. */
const IST_OFFSET_MINUTES = 330;

/**
 * The instant delivery date `D`'s menu locks: `lockTime` IST on `D − 1`.
 *
 * `deliveryDate` is a calendar date carried as UTC midnight — the
 * convention `MealDelivery.scheduledFor` and `MealPlanDayMenu.date`
 * already use. An unparseable `lockTime` falls back to the default
 * rather than throwing: a corrupted setting must not take skip/menu
 * editing down with it.
 */
export function menuLockAt(deliveryDate: Date, lockTime: string): Date {
  const minutes = parseTimeLabel(lockTime) ?? parseTimeLabel(DEFAULT_MENU_LOCK_TIME)!;
  const dayBeforeUtcMidnight = Date.UTC(
    deliveryDate.getUTCFullYear(),
    deliveryDate.getUTCMonth(),
    deliveryDate.getUTCDate() - 1,
  );
  return new Date(dayBeforeUtcMidnight + (minutes - IST_OFFSET_MINUTES) * 60_000);
}

/** Whether `deliveryDate`'s menu (and its skip window) has closed as of `now`. */
export function isMenuLocked(deliveryDate: Date, lockTime: string, now: Date): boolean {
  return now.getTime() >= menuLockAt(deliveryDate, lockTime).getTime();
}
