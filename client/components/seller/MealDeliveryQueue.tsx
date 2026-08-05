"use client";

import { useState } from "react";
import { Check, Phone } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { markMealDelivered } from "@/lib/api";
import { formatDate } from "@/lib/format";
import type { SellerMealDelivery } from "@/lib/types";
import styles from "./MealDeliveryQueue.module.css";

/** `"2026-08-05"` → local midnight, not UTC midnight. */
function parseDateKey(key: string): Date {
  return new Date(`${key}T00:00:00`);
}

function dateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Same rule as `server/src/meals/meal-brackets.ts`: this takes `now` rather
 * than reading the clock, so nothing here can disagree with the render that
 * produced the list. The caller stamps `now` when the fetch resolves —
 * which is after mount, so "Today" can never be computed during SSR and
 * hydrate against a different day (the M12 React #418 lesson).
 */
function dayHeading(key: string, now: Date): string {
  const today = dateKey(now);
  if (key === today) return "Today";
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (key === dateKey(tomorrow)) return "Tomorrow";
  return formatDate(parseDateKey(key), { weekday: "short", day: "2-digit", month: "short" });
}

export interface MealDeliveryQueueProps {
  deliveries: SellerMealDelivery[];
  /** Stamped when the list was fetched. Never read the clock in render. */
  now: Date;
  /** Called after a meal is marked delivered, so the parent can drop the row. */
  onDelivered: (deliveryId: string) => void;
}

/**
 * The cook's work queue — every meal owed, grouped by the day it is owed.
 *
 * "Mark delivered" is the **only** thing that spends a meal from a
 * subscriber's cycle (`SellerMealPlansService.markDelivered`). A skipped
 * meal is still owed, so nothing else may decrement it — which is why this
 * button confirms nothing and does exactly one thing.
 */
export function MealDeliveryQueue({ deliveries, now, onDelivered }: MealDeliveryQueueProps) {
  const [busyId, setBusyId] = useState<string | undefined>(undefined);
  const [error, setError] = useState<string | undefined>(undefined);

  const byDay = new Map<string, SellerMealDelivery[]>();
  for (const delivery of deliveries) {
    const bucket = byDay.get(delivery.scheduledFor);
    if (bucket) bucket.push(delivery);
    else byDay.set(delivery.scheduledFor, [delivery]);
  }

  async function handleDelivered(delivery: SellerMealDelivery) {
    setBusyId(delivery.id);
    setError(undefined);
    try {
      await markMealDelivered(delivery.id);
      onDelivered(delivery.id);
    } catch (err) {
      // A 409 means somebody already marked it — worth saying out loud
      // rather than leaving the row sitting there looking unhandled.
      setError(
        err instanceof Error
          ? err.message
          : "That didn't save. Check your connection and try again.",
      );
    } finally {
      setBusyId(undefined);
    }
  }

  return (
    <div className={styles.queue}>
      {error && (
        <p className={styles.error} role="alert" aria-live="polite">
          {error}
        </p>
      )}

      {[...byDay.entries()].map(([day, rows]) => (
        <section key={day} className={styles.day}>
          <h3 className={styles.dayTitle}>
            {dayHeading(day, now)}
            <span className={styles.dayCount}>
              {rows.length} meal{rows.length === 1 ? "" : "s"}
            </span>
          </h3>

          <div className={styles.rows}>
            {rows.map((delivery) => (
              <Card key={delivery.id} padding="none" className={styles.row}>
                <span className={styles.time}>{delivery.bracketStart}</span>

                <div className={styles.who}>
                  <span className={styles.customer}>{delivery.customerName}</span>
                  <span className={styles.address}>
                    {delivery.address.line1}
                    {delivery.address.line2 ? `, ${delivery.address.line2}` : ""} ·{" "}
                    {delivery.address.city} {delivery.address.pincode}
                  </span>
                  <span className={styles.plan}>{delivery.planName}</span>
                </div>

                <div className={styles.rowActions}>
                  {delivery.customerPhone && (
                    <a
                      href={`tel:${delivery.customerPhone}`}
                      className={styles.callLink}
                      aria-label={`Call ${delivery.customerName}`}
                    >
                      <Phone size={15} strokeWidth={1.7} aria-hidden="true" />
                    </a>
                  )}
                  <button
                    type="button"
                    className={styles.deliveredButton}
                    onClick={() => handleDelivered(delivery)}
                    disabled={busyId === delivery.id}
                  >
                    <Check size={15} strokeWidth={2} aria-hidden="true" />
                    {busyId === delivery.id ? "Saving…" : "Delivered"}
                  </button>
                </div>
              </Card>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
