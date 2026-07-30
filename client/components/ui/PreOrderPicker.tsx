"use client";

import { useEffect, useState } from "react";
import clsx from "clsx";
import { getScheduleDays, describeSlot, type ScheduleDay } from "@/lib/schedule";
import styles from "./PreOrderPicker.module.css";

export interface PreOrderSelection {
  dayId: string;
  windowId: string;
}

export interface PreOrderPickerProps {
  value: PreOrderSelection | undefined;
  onChange: (next: PreOrderSelection) => void;
  title?: string;
  /** Days generated once by the caller when it needs to match a server render. */
  days?: ScheduleDay[];
}

/**
 * "When do you want it?" — the shared pre-order day + time-window picker.
 *
 * Used by Snacks (where the choice rides into the WhatsApp message rather
 * than an order record) and available to any other module that schedules.
 * Laundry keeps its own two-slot pickup/delivery picker, since it asks the
 * question twice with different meanings.
 *
 * Windows already past *today* never appear — `getScheduleDays` filters
 * them against the clock with a lead time, so this can't offer 9 AM at
 * 6 PM. Switching to a day whose windows don't include the current
 * selection re-picks the first available one rather than silently keeping
 * an impossible combination.
 *
 * **Client-only by construction.** The day list depends on `new Date()`,
 * and the server renders at a different instant — and often in a different
 * timezone — than the browser hydrating it. Computing during SSR produced
 * a hydration mismatch (React #418) whenever the two disagreed about what
 * "Today" is. So the schedule is built in an effect, after mount, and the
 * first paint is a stable placeholder that matches on both sides.
 */
export function PreOrderPicker({ value, onChange, title = "When would you like it?", days }: PreOrderPickerProps) {
  const [scheduleDays, setScheduleDays] = useState<ScheduleDay[]>(days ?? []);

  useEffect(() => {
    if (days) return;
    // Deferred a tick to keep this off the "synchronous setState in an
    // effect body" path, same as the other client stores here.
    let cancelled = false;
    void Promise.resolve().then(() => {
      if (!cancelled) setScheduleDays(getScheduleDays());
    });
    return () => {
      cancelled = true;
    };
  }, [days]);

  // Auto-select the soonest slot once the schedule exists, so someone who
  // just wants food now never has to touch this.
  useEffect(() => {
    if (value || scheduleDays.length === 0) return;
    const first = scheduleDays[0];
    if (first?.windows[0]) onChange({ dayId: first.id, windowId: first.windows[0].id });
  }, [value, scheduleDays, onChange]);

  const selectedDay = scheduleDays.find((d) => d.id === value?.dayId) ?? scheduleDays[0];

  // Pre-hydration placeholder — identical on server and client.
  if (scheduleDays.length === 0) {
    return (
      <div className={styles.wrap}>
        <h3 className={styles.title}>{title}</h3>
        <p className={styles.none}>Loading delivery times…</p>
      </div>
    );
  }

  if (!selectedDay) {
    return (
      <div className={styles.wrap}>
        <p className={styles.none}>
          No delivery windows left today. Please try again tomorrow morning.
        </p>
      </div>
    );
  }

  function pickDay(day: ScheduleDay) {
    const stillValid = day.windows.some((w) => w.id === value?.windowId);
    onChange({
      dayId: day.id,
      windowId: stillValid ? value!.windowId : day.windows[0].id,
    });
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.head}>
        <h3 className={styles.title}>{title}</h3>
        {value && <span className={styles.chosen}>{describeSlot(value.dayId, value.windowId)}</span>}
      </div>

      <span className={styles.label}>Day</span>
      <div className={clsx(styles.row, "hk-scroll")} role="group" aria-label="Delivery day">
        {scheduleDays.map((day) => (
          <button
            key={day.id}
            type="button"
            className={clsx(styles.day, day.id === selectedDay.id && styles.daySelected)}
            aria-pressed={day.id === selectedDay.id}
            onClick={() => pickDay(day)}
          >
            <span className={styles.dayName}>{day.day}</span>
            <span className={styles.dayDate}>{day.date}</span>
          </button>
        ))}
      </div>

      <span className={styles.label}>Time</span>
      <div className={styles.windows} role="group" aria-label="Delivery time">
        {selectedDay.windows.map((window) => (
          <button
            key={window.id}
            type="button"
            className={clsx(styles.window, window.id === value?.windowId && styles.windowSelected)}
            aria-pressed={window.id === value?.windowId}
            onClick={() => onChange({ dayId: selectedDay.id, windowId: window.id })}
          >
            {window.label}
            <span className={styles.part}>{window.partOfDay}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
