/**
 * Delivery/pickup scheduling, shared by every module that asks "when?".
 *
 * Laundry, snacks pre-orders and marketplace checkout each used to invent
 * their own day list, which is how the laundry picker ended up offering
 * dates in the past. One generator, rolling forward from *now*, means that
 * class of bug can only be fixed once.
 *
 * Two things the old pickers got wrong and this doesn't:
 *
 * 1. **Today's expired windows.** At 6pm, "9 – 11 AM today" is not a
 *    choice. Slots for today are filtered against the clock, with a lead
 *    time so a kitchen isn't handed an order 5 minutes before the window
 *    opens.
 * 2. **"Thu 30 Jul" tells you nothing.** People think in "Today",
 *    "Tomorrow", then weekday. The labels follow that.
 */

/**
 * How much notice a kitchen needs before a window opens, when it hasn't
 * said otherwise. A HomeKrafter's own `prepTimeMins` overrides this
 * (M16) — the platform default stays 90 minutes so a kitchen that has
 * declared nothing behaves exactly as it did before.
 */
export const DEFAULT_LEAD_TIME_MINUTES = 90;

/**
 * How far ahead you can pre-order. Two weeks rather than one since M16:
 * a kitchen that needs 48 hours' notice and takes Sundays off had barely
 * three pickable days inside a 7-day window, and festival orders are
 * planned further out than that.
 */
export const SCHEDULE_HORIZON_DAYS = 14;

export interface DeliveryWindow {
  id: string;
  /** Short label for the chip, e.g. "9 – 11 AM". */
  label: string;
  /** Which part of the day, for grouping and copy. */
  partOfDay: "Morning" | "Afternoon" | "Evening";
  /** Local hour the window opens, 0–23. Used to expire today's past slots. */
  startHour: number;
  endHour: number;
}

export const DELIVERY_WINDOWS: DeliveryWindow[] = [
  { id: "w-morning", label: "9 – 11 AM", partOfDay: "Morning", startHour: 9, endHour: 11 },
  { id: "w-midday", label: "12 – 2 PM", partOfDay: "Afternoon", startHour: 12, endHour: 14 },
  { id: "w-afternoon", label: "3 – 5 PM", partOfDay: "Afternoon", startHour: 15, endHour: 17 },
  { id: "w-evening", label: "6 – 8 PM", partOfDay: "Evening", startHour: 18, endHour: 20 },
];

export interface ScheduleDay {
  id: string;
  /** "Today" / "Tomorrow" / "Sat". */
  day: string;
  /** "30 Jul". */
  date: string;
  isoDate: string;
  isToday: boolean;
  /** Windows still bookable on this day — today's expired ones are dropped. */
  windows: DeliveryWindow[];
  /**
   * Why this day can't be booked, when it can't (M16). Closed days are
   * **kept in the list and marked**, not silently dropped: "Sat is greyed
   * out because they're closed for Diwali" is information, and a date
   * that just isn't there reads as a bug.
   */
  unavailableReason?: string;
}

/**
 * What a specific kitchen can actually cook, from
 * `GET /vendors/:slug/availability` (M16, M2).
 *
 * Every field is optional and every default reproduces the pre-M16
 * behaviour exactly — a caller with no availability to hand gets the same
 * rolling week it always did.
 */
export interface ScheduleAvailability {
  /** Minutes of notice. A baker needing 48 hours and a cook frying samosas in an hour were offered identical slots before this. */
  prepTimeMins?: number;
  /** 0 = Sunday. Empty or absent means "not stated", which is read as *every* day — never as "closed". */
  workingDays?: number[];
  /** `YYYY-MM-DD` days off, with the reason to show. */
  blackouts?: { date: string; reason?: string }[];
}

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function isoDateOf(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * The next `days` bookable days, starting today.
 *
 * `now` is injectable so this is testable and so a server render and the
 * client agree on "today" when it matters.
 *
 * **M16 adds `availability`, and nothing about the old behaviour moved.**
 * With no availability passed, this returns exactly what it always did:
 * a rolling week, a 90-minute lead time, today's expired windows dropped.
 * With one, the lead time becomes that kitchen's declared prep time, days
 * outside their working pattern are marked closed, and days they have
 * blacked out are marked with their reason.
 *
 * Two rules worth not undoing:
 *
 * 1. **A closed day stays in the list, marked.** Dropping it makes the
 *    strip skip dates for no visible reason. The one exception is a day
 *    whose windows have *all expired* — that is today late in the
 *    evening, and there is nothing to say about it.
 * 2. **No working days stated means open every day**, never closed every
 *    day. A HomeKrafter who has filled in nothing must not silently stop
 *    taking orders — the same "absence is not a gate" rule location
 *    filtering follows.
 */
export function getScheduleDays(
  days = SCHEDULE_HORIZON_DAYS,
  now = new Date(),
  availability?: ScheduleAvailability,
): ScheduleDay[] {
  const out: ScheduleDay[] = [];
  const leadMinutes = availability?.prepTimeMins ?? DEFAULT_LEAD_TIME_MINUTES;
  const cutoffMinutes = now.getHours() * 60 + now.getMinutes() + leadMinutes;
  const blackoutByDate = new Map(
    (availability?.blackouts ?? []).map((b) => [b.date, b.reason]),
  );
  const worksEveryDay = !availability?.workingDays || availability.workingDays.length === 0;

  for (let offset = 0; offset < days; offset += 1) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset);
    const isToday = offset === 0;
    const isoDate = isoDateOf(d);

    // One rule for every day: a window is bookable when it opens at least
    // `leadMinutes` from now. Measuring both sides in minutes-since-
    // midnight-today means a 48-hour prep time needs no special case — the
    // near days simply run out of windows.
    const dayStartMinutes = offset * 24 * 60;
    const windows = DELIVERY_WINDOWS.filter(
      (w) => dayStartMinutes + w.startHour * 60 >= cutoffMinutes,
    );

    // Every window past means nothing to offer and nothing to explain —
    // this is what makes the list shorter than `days` late in the evening.
    if (windows.length === 0) continue;

    const blackoutReason = blackoutByDate.get(isoDate);
    const closedWeekly = !worksEveryDay && !availability!.workingDays!.includes(d.getDay());
    const unavailableReason = blackoutReason
      ? blackoutReason || "Closed"
      : blackoutByDate.has(isoDate)
        ? "Closed"
        : closedWeekly
          ? "Not a cooking day"
          : undefined;

    out.push({
      id: `sd-${isoDate}`,
      day: isToday ? "Today" : offset === 1 ? "Tomorrow" : DAY_NAMES[d.getDay()],
      date: `${d.getDate()} ${MONTH_NAMES[d.getMonth()]}`,
      isoDate,
      isToday,
      windows,
      unavailableReason,
    });
  }

  return out;
}

/** Days that can actually be picked — what a default selection should choose from. */
export function bookableDays(days: ScheduleDay[]): ScheduleDay[] {
  return days.filter((d) => !d.unavailableReason && d.windows.length > 0);
}

/** The soonest bookable day+window — the sensible default selection. Skips days the kitchen is closed. */
export function firstAvailableSlot(
  now = new Date(),
  availability?: ScheduleAvailability,
): { dayId: string; windowId: string } | undefined {
  const [first] = bookableDays(getScheduleDays(SCHEDULE_HORIZON_DAYS, now, availability));
  if (!first) return undefined;
  return { dayId: first.id, windowId: first.windows[0].id };
}

/** "Tomorrow, 6 – 8 PM" — for confirmations and the WhatsApp message. */
export function describeSlot(
  dayId: string,
  windowId: string,
  now = new Date(),
  availability?: ScheduleAvailability,
): string {
  const day = getScheduleDays(SCHEDULE_HORIZON_DAYS, now, availability).find((d) => d.id === dayId);
  const window = DELIVERY_WINDOWS.find((w) => w.id === windowId);
  if (!day || !window) return "As soon as possible";
  const when = day.isToday || day.day === "Tomorrow" ? day.day : `${day.day} ${day.date}`;
  return `${when}, ${window.label}`;
}
