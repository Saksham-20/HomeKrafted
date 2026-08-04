/**
 * Delivery brackets — the 30-minute windows a meal subscription can be
 * delivered in.
 *
 * Pure on purpose, and it never reads the clock. Every function takes what
 * it needs as an argument, the same rule `client/lib/occasions.ts` follows,
 * because a Server Component that computes a window during render and a
 * browser that recomputes it during hydration must agree — CLAUDE.md
 * records the React #418 this caused in M12.
 *
 * A bracket is a **label**, "12:30" meaning 12:30–13:00, stored as a string
 * rather than a timestamp. A home cook and a buyer agree on a time of day;
 * they do not agree on an instant, and pinning one would move the window
 * the first time anything about the calendar changed underneath it.
 */

/** Minutes in one bracket. Thirty is the width the whole feature is specified in. */
export const BRACKET_MINUTES = 30;

export type MealTypeKey = 'breakfast' | 'lunch' | 'dinner';

/**
 * When each meal is plausibly eaten, used when a kitchen has not stated its
 * hours. These are windows for *delivery*, not for cooking: nobody wants
 * dinner at 15:00 just because the kitchen happens to be open.
 */
export const DEFAULT_MEAL_WINDOWS: Record<MealTypeKey, { from: string; to: string }> = {
  breakfast: { from: '07:00', to: '10:00' },
  lunch: { from: '12:00', to: '15:00' },
  dinner: { from: '19:00', to: '22:00' },
};

/** `"12:30"` → `750`. Returns `null` for anything that isn't `HH:MM`. */
export function parseTimeLabel(label: string): number | null {
  const match = /^(\d{2}):(\d{2})$/.exec(label);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

/** `750` → `"12:30"`. */
export function formatTimeLabel(minutesOfDay: number): string {
  const wrapped = ((minutesOfDay % 1440) + 1440) % 1440;
  const hours = Math.floor(wrapped / 60);
  const minutes = wrapped % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

/** `"12:30"` → `"12:30–13:00"`, for anything a person reads. */
export function formatBracketRange(start: string): string {
  const startMinutes = parseTimeLabel(start);
  if (startMinutes === null) return start;
  return `${start}–${formatTimeLabel(startMinutes + BRACKET_MINUTES)}`;
}

export interface BracketOptions {
  /** `VendorProfile.opensAt`, if the kitchen has stated one. */
  opensAt?: string | null;
  /** `VendorProfile.closesAt`, if the kitchen has stated one. */
  closesAt?: string | null;
}

/**
 * The brackets a buyer may choose for this meal at this kitchen.
 *
 * The meal window is the starting point and the kitchen's hours only ever
 * *narrow* it. A kitchen open 06:00–23:00 does not thereby offer breakfast
 * at 22:00, and — the case that actually matters — a kitchen that has filled
 * in nothing must still be bookable, so absent hours mean the default window
 * stands rather than an empty list. That mirrors M16's rule that no stated
 * working days means open every day, never closed.
 *
 * Returns an empty array only when the kitchen's stated hours genuinely do
 * not overlap the meal at all (a breakfast plan from a kitchen that opens at
 * noon). That is a real configuration error, and an empty picker with an
 * explanation beats a picker offering a time nobody will cook.
 */
export function bracketsFor(mealType: MealTypeKey, options: BracketOptions = {}): string[] {
  const window = DEFAULT_MEAL_WINDOWS[mealType];
  let from = parseTimeLabel(window.from)!;
  let to = parseTimeLabel(window.to)!;

  const opens = options.opensAt ? parseTimeLabel(options.opensAt) : null;
  const closes = options.closesAt ? parseTimeLabel(options.closesAt) : null;

  if (opens !== null) from = Math.max(from, opens);
  if (closes !== null) to = Math.min(to, closes);

  const brackets: string[] = [];
  // `start + BRACKET_MINUTES <= to` rather than `start < to`: a bracket that
  // would run past closing is not a bracket the kitchen can serve.
  for (let start = roundUpToBracket(from); start + BRACKET_MINUTES <= to; start += BRACKET_MINUTES) {
    brackets.push(formatTimeLabel(start));
  }
  return brackets;
}

/** Snaps to the next :00 or :30 so every bracket lands on a half hour. */
function roundUpToBracket(minutesOfDay: number): number {
  const remainder = minutesOfDay % BRACKET_MINUTES;
  return remainder === 0 ? minutesOfDay : minutesOfDay + (BRACKET_MINUTES - remainder);
}

/** Is `bracketStart` one this kitchen actually offers for this meal? */
export function isBracketAllowed(
  bracketStart: string,
  mealType: MealTypeKey,
  options: BracketOptions = {},
): boolean {
  return bracketsFor(mealType, options).includes(bracketStart);
}

export interface ScheduleOptions {
  /** `VendorProfile.workingDays`, 0 = Sunday. Empty means every day. */
  workingDays?: number[];
  /** Blackout dates as UTC-midnight `Date`s. */
  blackoutDates?: Date[];
  /** `VendorProfile.prepTimeMins`. Absent means the platform default. */
  prepTimeMins?: number | null;
}

/** The platform's notice period when a kitchen has stated none. Never zero. */
export const DEFAULT_PREP_TIME_MINS = 90;

/**
 * The dates a subscription's meals fall on.
 *
 * Counts forward from `startDate` picking only `daysOfWeek` the buyer chose,
 * skipping days the kitchen does not work and days it has blacked out, until
 * it has `mealCount` dates. The buyer paid for a number of **meals**, not a
 * number of days, so a closed kitchen pushes the end date outward instead of
 * quietly costing them a meal.
 *
 * `maxLookaheadDays` stops a subscription whose day selection can never be
 * satisfied (Sundays only, from a kitchen that never works Sundays) from
 * looping forever. Hitting it returns fewer dates than asked for, which the
 * caller must treat as a refusal rather than a short cycle.
 */
export function scheduleDates(
  startDate: Date,
  daysOfWeek: number[],
  mealCount: number,
  options: ScheduleOptions = {},
  maxLookaheadDays = 365,
): Date[] {
  const working = options.workingDays ?? [];
  const blackouts = new Set((options.blackoutDates ?? []).map((d) => toDateKey(d)));
  const wanted = new Set(daysOfWeek);

  const dates: Date[] = [];
  const cursor = new Date(
    Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth(), startDate.getUTCDate()),
  );

  for (let step = 0; step < maxLookaheadDays && dates.length < mealCount; step += 1) {
    const day = cursor.getUTCDay();
    const isWanted = wanted.has(day);
    // Empty `workingDays` is "no set days", which M16 reads as open every
    // day. Reading it as closed would silently stop every kitchen that has
    // not filled the field in.
    const kitchenWorks = working.length === 0 || working.includes(day);
    if (isWanted && kitchenWorks && !blackouts.has(toDateKey(cursor))) {
      dates.push(new Date(cursor));
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return dates;
}

/** `YYYY-MM-DD` in UTC — the comparable form of a date-only column. */
export function toDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * The earliest date a subscription may start, given how much notice the
 * kitchen needs. Prep time is per *meal*, so anything under a day still
 * means "not today" once the day's cooking has started; rounding up to whole
 * days is the honest reading and avoids promising a lunch ordered at 11:55.
 */
export function earliestStartDate(now: Date, prepTimeMins?: number | null): Date {
  const prep = prepTimeMins ?? DEFAULT_PREP_TIME_MINS;
  const daysOfNotice = Math.max(1, Math.ceil(prep / (60 * 24)));
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  start.setUTCDate(start.getUTCDate() + daysOfNotice);
  return start;
}
