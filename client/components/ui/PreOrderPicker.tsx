"use client";

import { useEffect, useState } from "react";
import clsx from "clsx";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  bookableDays,
  describeSlot,
  getScheduleDays,
  type ScheduleAvailability,
  type ScheduleDay,
} from "@/lib/schedule";
import styles from "./PreOrderPicker.module.css";

export interface PreOrderSelection {
  dayId: string;
  windowId: string;
}

export interface PreOrderPickerProps {
  value: PreOrderSelection | undefined;
  onChange: (next: PreOrderSelection) => void;
  title?: string;
  /** Timezone/serving-area line above the slots. */
  zoneLabel?: string;
  /** Pre-built days, when a caller needs to match a server render. */
  days?: ScheduleDay[];
  /**
   * What this specific kitchen can cook (M16) — prep time, working days,
   * days off. Omitted, the picker behaves exactly as it did before:
   * a rolling window with the platform's 90-minute lead time.
   */
  availability?: ScheduleAvailability;
  /** Rendered next to the confirm action. Omit for an inline picker with no footer action. */
  onConfirm?: () => void;
  confirmLabel?: string;
}

/** Days visible at once before paging. */
const PAGE_SIZE = 6;

/**
 * Delivery-window scheduler: month header, paged day strip, time grid.
 *
 * The visual design is ported from a Tailwind/shadcn `DeliveryScheduler`;
 * this project has no Tailwind (CLAUDE.md), so it's rebuilt on CSS Modules
 * over `--hk-*` tokens, and the shared-element selection animation is a
 * CSS transition rather than framer-motion — same read, one less runtime
 * dependency.
 *
 * **The date logic is deliberately not ported.** That component built its
 * strip with `getWeekDays()`, which returns Mon–Sat of the *current* week
 * and therefore includes days already gone, and it never filtered expired
 * times. For scheduling a delivery both are wrong: on a Thursday it would
 * offer Monday, and at 6pm it would offer 9am. This keeps
 * `getScheduleDays()` — rolling forward from now, with today's past windows
 * dropped against a lead time — and pages through those days instead.
 *
 * **Client-only by construction**: the schedule depends on `new Date()`,
 * and the server renders at a different instant (often a different
 * timezone) than the browser hydrating it, which produced React #418. The
 * days are built in an effect after mount behind a stable placeholder.
 */
export function PreOrderPicker({
  value,
  onChange,
  title = "Delivery window",
  zoneLabel = "Chandigarh tricity (IST)",
  days,
  availability,
  onConfirm,
  confirmLabel = "Schedule",
}: PreOrderPickerProps) {
  const [scheduleDays, setScheduleDays] = useState<ScheduleDay[]>(days ?? []);
  const [pageStart, setPageStart] = useState(0);

  useEffect(() => {
    if (days) return;
    let cancelled = false;
    void Promise.resolve().then(() => {
      if (!cancelled) setScheduleDays(getScheduleDays(undefined, undefined, availability));
    });
    return () => {
      cancelled = true;
    };
  }, [days, availability]);

  // Auto-select the soonest slot, so someone who wants food now never has
  // to touch this. Skips days the kitchen is closed — defaulting onto a
  // blacked-out day would hand them an order they can't cook.
  useEffect(() => {
    if (value || scheduleDays.length === 0) return;
    const first = bookableDays(scheduleDays)[0];
    if (first?.windows[0]) onChange({ dayId: first.id, windowId: first.windows[0].id });
  }, [value, scheduleDays, onChange]);

  if (scheduleDays.length === 0) {
    return (
      <div className={styles.card}>
        <span className={styles.fieldLabel}>{title}</span>
        <p className={styles.none}>Loading delivery times…</p>
      </div>
    );
  }

  const openDays = bookableDays(scheduleDays);
  const selectedDay = scheduleDays.find((d) => d.id === value?.dayId) ?? openDays[0] ?? scheduleDays[0];
  const visible = scheduleDays.slice(pageStart, pageStart + PAGE_SIZE);

  // Month label follows what's on screen, not `new Date()` — paging into
  // August should say August.
  const monthYear = new Date(`${visible[0]?.isoDate ?? selectedDay.isoDate}T12:00:00`).toLocaleDateString(
    "en-IN",
    { month: "long", year: "numeric" },
  );

  function pickDay(day: ScheduleDay) {
    // Closed days render, so they can explain themselves — but they don't
    // select. Silently dropping them from the strip would make the dates
    // skip for no visible reason.
    if (day.unavailableReason) return;
    // Keep the chosen time when the new day still offers it; otherwise take
    // that day's first window rather than leaving an impossible pairing.
    const stillValid = day.windows.some((w) => w.id === value?.windowId);
    onChange({ dayId: day.id, windowId: stillValid ? value!.windowId : day.windows[0].id });
  }

  return (
    <div className={styles.card}>
      <div className={styles.stack}>
        <div>
          <span className={styles.fieldLabel}>{title}</span>
          <div className={styles.headRow}>
            <h3 className={styles.monthYear}>{monthYear}</h3>
            <div className={styles.navGroup}>
              <button
                type="button"
                className={styles.navButton}
                onClick={() => setPageStart((p) => Math.max(0, p - PAGE_SIZE))}
                disabled={pageStart === 0}
                aria-label="Earlier days"
              >
                <ChevronLeft size={16} strokeWidth={1.8} aria-hidden="true" />
              </button>
              <button
                type="button"
                className={styles.navButton}
                onClick={() =>
                  setPageStart((p) => Math.min(Math.max(0, scheduleDays.length - PAGE_SIZE), p + PAGE_SIZE))
                }
                disabled={pageStart + PAGE_SIZE >= scheduleDays.length}
                aria-label="Later days"
              >
                <ChevronRight size={16} strokeWidth={1.8} aria-hidden="true" />
              </button>
            </div>
          </div>
        </div>

        <div className={styles.dayGrid} role="group" aria-label="Delivery day">
          {visible.map((day) => {
            const isSelected = day.id === selectedDay.id;
            const closed = Boolean(day.unavailableReason);
            return (
              <div key={day.id} className={styles.dayCell}>
                <span className={styles.dayName}>{day.day}</span>
                <button
                  type="button"
                  className={clsx(
                    styles.dayButton,
                    isSelected && !closed && styles.daySelected,
                    closed && styles.dayClosed,
                  )}
                  aria-pressed={isSelected && !closed}
                  disabled={closed}
                  // The reason goes in the accessible name, not only in a
                  // tooltip — "unavailable" with no cause is the least
                  // useful thing a disabled control can say.
                  aria-label={
                    closed
                      ? `${day.day} ${day.date} — ${day.unavailableReason}`
                      : `${day.day} ${day.date}`
                  }
                  title={day.unavailableReason}
                  onClick={() => pickDay(day)}
                >
                  {day.date.split(" ")[0]}
                </button>
              </div>
            );
          })}
        </div>

        <div>
          <p className={styles.zone}>{zoneLabel}</p>
          {selectedDay.unavailableReason && (
            <p className={styles.closedNote} role="status">
              {selectedDay.day} — {selectedDay.unavailableReason}. Pick another day.
            </p>
          )}
          <div className={styles.timeGrid} role="group" aria-label="Delivery time">
            {(selectedDay.unavailableReason ? [] : selectedDay.windows).map((window) => {
              const isSelected = window.id === value?.windowId;
              return (
                <button
                  key={window.id}
                  type="button"
                  className={clsx(styles.timeButton, isSelected && styles.timeSelected)}
                  aria-pressed={isSelected}
                  onClick={() => onChange({ dayId: selectedDay.id, windowId: window.id })}
                >
                  {window.label}
                  <span className={styles.part}>{window.partOfDay}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className={styles.footer}>
          <span className={styles.chosen}>
            {value ? describeSlot(value.dayId, value.windowId, undefined, availability) : "Pick a time"}
          </span>
          {onConfirm && (
            <button type="button" className={clsx(styles.timeButton, styles.timeSelected)} onClick={onConfirm}>
              {confirmLabel}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
