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

/** How much notice a kitchen needs before a window opens. */
const LEAD_TIME_MINUTES = 90;

/** How far ahead you can pre-order. */
export const SCHEDULE_HORIZON_DAYS = 7;

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
 */
export function getScheduleDays(days = SCHEDULE_HORIZON_DAYS, now = new Date()): ScheduleDay[] {
  const out: ScheduleDay[] = [];
  const cutoffMinutes = now.getHours() * 60 + now.getMinutes() + LEAD_TIME_MINUTES;

  for (let offset = 0; offset < days; offset += 1) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset);
    const isToday = offset === 0;

    const windows = isToday
      ? DELIVERY_WINDOWS.filter((w) => w.startHour * 60 >= cutoffMinutes)
      : DELIVERY_WINDOWS;

    // A day with every window already past is not offerable — drop it
    // entirely rather than show a date that can't be picked. This is why
    // the list can be shorter than `days` late in the evening.
    if (windows.length === 0) continue;

    out.push({
      id: `sd-${isoDateOf(d)}`,
      day: isToday ? "Today" : offset === 1 ? "Tomorrow" : DAY_NAMES[d.getDay()],
      date: `${d.getDate()} ${MONTH_NAMES[d.getMonth()]}`,
      isoDate: isoDateOf(d),
      isToday,
      windows,
    });
  }

  return out;
}

/** The soonest bookable day+window — the sensible default selection. */
export function firstAvailableSlot(now = new Date()): { dayId: string; windowId: string } | undefined {
  const [first] = getScheduleDays(SCHEDULE_HORIZON_DAYS, now);
  if (!first || first.windows.length === 0) return undefined;
  return { dayId: first.id, windowId: first.windows[0].id };
}

/** "Tomorrow, 6 – 8 PM" — for confirmations and the WhatsApp message. */
export function describeSlot(dayId: string, windowId: string, now = new Date()): string {
  const day = getScheduleDays(SCHEDULE_HORIZON_DAYS, now).find((d) => d.id === dayId);
  const window = DELIVERY_WINDOWS.find((w) => w.id === windowId);
  if (!day || !window) return "As soon as possible";
  const when = day.isToday || day.day === "Tomorrow" ? day.day : `${day.day} ${day.date}`;
  return `${when}, ${window.label}`;
}
