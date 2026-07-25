/**
 * Date formatting helpers shared across modules (order dates, laundry
 * slot pickers, wallet ledger). All use `en-IN` locale formatting.
 */

function toDate(value: string | Date): Date {
  return typeof value === "string" ? new Date(value) : value;
}

/** "19 Jul 2026" */
export function formatDate(
  value: string | Date,
  options: Intl.DateTimeFormatOptions = {
    day: "2-digit",
    month: "short",
    year: "numeric",
  },
): string {
  return new Intl.DateTimeFormat("en-IN", options).format(toDate(value));
}

/** "19 Jul" — no year, used by compact slot/day pickers. */
export function formatShortDate(value: string | Date): string {
  return formatDate(value, { day: "2-digit", month: "short" });
}

/** "Sat" — short weekday label for day-picker tiles. */
export function formatDayLabel(value: string | Date): string {
  return new Intl.DateTimeFormat("en-IN", { weekday: "short" }).format(
    toDate(value),
  );
}
