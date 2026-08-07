"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import clsx from "clsx";
import { Button } from "@/components/ui/Button";
import { ApiError } from "@/lib/api/http";
import {
  cancelMealSubscription,
  getMySubscription,
  getMySubscriptions,
  pauseMealSubscription,
  resumeMealSubscription,
  skipMealDelivery,
} from "@/lib/api";
import { formatCurrency, formatDate } from "@/lib/format";
import type { MealDeliveryStatus, MealSubscription } from "@/lib/types";
import styles from "./SubscriptionsListClient.module.css";

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const STATUS_COPY: Record<MealSubscription["status"], string> = {
  active: "Active",
  paused: "Paused",
  cancelled: "Cancelled",
  expired: "Finished",
};

/**
 * Per-meal copy. The rows used to render `delivery.status` raw, so a
 * paused plan showed a bare **CANCELLED** against a date — which on this
 * product reads as "you lost that meal", the exact opposite of what
 * happened. The meal is owed back and the cycle grew a day at the far end
 * (`CLAUDE.md`, M19). `unavailable` was worse: a kitchen blackout day
 * rendered as a word with no meaning to a buyer at all.
 */
const DELIVERY_STATUS_COPY: Record<MealDeliveryStatus, string> = {
  scheduled: "Scheduled",
  skipped: "Skipped",
  unavailable: "Kitchen closed",
  delivered: "Delivered",
  cancelled: "Not sent",
};

/** Shown when the row carries no `reason` of its own — every non-scheduled state owes the buyer an explanation, and the server does not always supply one. */
const DELIVERY_STATUS_NOTE: Partial<Record<MealDeliveryStatus, string>> = {
  skipped: "You skipped this one — it's added back at the end.",
  unavailable: "The kitchen wasn't cooking — this meal is added back at the end.",
  cancelled: "Added back at the end of your plan.",
};

/**
 * The buyer's meal subscriptions, and everything they can do to one.
 *
 * Client-fetched so a subscription created moments ago in this same browser
 * session is here when the subscribe form redirects — that redirect is the
 * first thing somebody sees after their wallet is debited.
 *
 * Every mutation goes through `run()`, which catches. Three of the four
 * actions here can legitimately be refused by the server (resume when the
 * kitchen can no longer fit the remaining meals, skip on a delivery that
 * already moved, cancel on something already cancelled), and each refusal
 * carries a message the buyer needs. Swallowing them is the silent-failure
 * class M19 spent a workstream removing.
 */
export function SubscriptionsListClient() {
  const searchParams = useSearchParams();
  const highlightId = searchParams.get("new");

  const [subscriptions, setSubscriptions] = useState<MealSubscription[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(highlightId);
  /**
   * `GET /meal-subscriptions` returns no deliveries — only the detail call
   * does. Expanding fetches them and keeps them here, so opening a plan
   * costs one request and closing it costs none.
   */
  const [deliveriesById, setDeliveriesById] = useState<
    Record<string, MealSubscription["deliveries"]>
  >({});

  const load = useCallback(async () => {
    try {
      setSubscriptions(await getMySubscriptions());
    } catch {
      setError("We couldn't load your meal plans. Reload the page to try again.");
      setSubscriptions([]);
    }
  }, []);

  const toggleExpanded = useCallback(
    async (id: string) => {
      if (expandedId === id) {
        setExpandedId(null);
        return;
      }
      setExpandedId(id);
      if (deliveriesById[id]) return;
      const detail = await getMySubscription(id);
      if (detail?.deliveries) {
        setDeliveriesById((current) => ({ ...current, [id]: detail.deliveries }));
      }
    },
    [expandedId, deliveriesById],
  );

  /*
    The fetch is inlined here with `.then` rather than calling `load()`,
    so every `setState` happens in a callback rather than in the effect
    body — `react-hooks/set-state-in-effect` flags the latter as a
    cascading render. `load` still exists for re-fetching after a
    mutation, where it is not in an effect at all. Same shape as
    `OrdersListClient`.
  */
  useEffect(() => {
    getMySubscriptions()
      .then((list) => setSubscriptions(list))
      .catch(() => {
        setError("We couldn't load your meal plans. Reload the page to try again.");
        setSubscriptions([]);
      });
  }, []);

  async function run(id: string, work: () => Promise<unknown>) {
    setBusyId(id);
    setError(null);
    try {
      await work();
      await load();
      // Deliveries just moved — drop the cache so an expanded plan does
      // not keep showing the schedule from before the skip.
      setDeliveriesById((current) => {
        const next = { ...current };
        delete next[id];
        return next;
      });
      if (expandedId === id) {
        const detail = await getMySubscription(id);
        if (detail?.deliveries) {
          setDeliveriesById((current) => ({ ...current, [id]: detail.deliveries }));
        }
      }
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "That didn't go through. Please try again.",
      );
    } finally {
      setBusyId(null);
    }
  }

  if (subscriptions === null) {
    return <p className={styles.loading}>Loading your meal plans…</p>;
  }

  return (
    <div className={styles.wrap}>
      <header className={styles.header}>
        <h1 className={styles.title}>Meal plans</h1>
        <p className={styles.subtitle}>
          Your prepaid meal cycles. Skip a day and the meal is owed back to you — the plan just
          runs a day longer.
        </p>
      </header>

      <div aria-live="polite" role="alert" className={styles.errorRegion}>
        {error && <p className={styles.error}>{error}</p>}
      </div>

      {subscriptions.length === 0 ? (
        <div className={styles.empty}>
          <p className={styles.emptyLead}>You don&rsquo;t have a meal plan yet.</p>
          <p className={styles.emptyBody}>
            A plan is a run of meals from one home kitchen, paid for once and delivered on the
            days you pick.
          </p>
          <Link href="/meal-plans" className={styles.emptyLink}>
            Browse meal plans →
          </Link>
        </div>
      ) : (
        <ul className={styles.list}>
          {subscriptions.map((sub) => {
            const isOpen = expandedId === sub.id;
            const isBusy = busyId === sub.id;
            const canAct = sub.status === "active" || sub.status === "paused";

            return (
              <li
                key={sub.id}
                className={clsx(styles.card, highlightId === sub.id && styles.highlight)}
              >
                {highlightId === sub.id && (
                  <p className={styles.newBanner}>
                    Your plan is set. First meal on {formatDate(sub.startDate)}.
                  </p>
                )}

                <div className={styles.cardHead}>
                  <div>
                    <h2 className={styles.planName}>
                      {sub.plan?.name ?? "Meal plan"}
                      {sub.vendorName && <span className={styles.vendor}> · {sub.vendorName}</span>}
                    </h2>
                    <p className={styles.meta}>
                      {sub.daysOfWeek.map((d) => DAY_LABELS[d]).join(", ")} · {sub.bracketLabel}
                    </p>
                  </div>
                  <span className={clsx(styles.status, styles[`status_${sub.status}`])}>
                    {STATUS_COPY[sub.status]}
                  </span>
                </div>

                <dl className={styles.stats}>
                  <div>
                    <dt>Meals left</dt>
                    {/* Remaining over total, not a bare number: "11 left" is
                        only meaningful next to what was bought. */}
                    <dd>
                      {sub.mealsRemaining} <span className={styles.of}>of {sub.mealsTotal}</span>
                    </dd>
                  </div>
                  <div>
                    <dt>Paid</dt>
                    <dd>{formatCurrency(sub.amountPaid)}</dd>
                  </div>
                  <div>
                    <dt>Runs until</dt>
                    <dd>{formatDate(sub.endDate)}</dd>
                  </div>
                </dl>

                {canAct && (
                  <div className={styles.actions}>
                    {sub.status === "active" ? (
                      <Button
                        variant="secondary"
                        disabled={isBusy}
                        onClick={() => run(sub.id, () => pauseMealSubscription(sub.id))}
                      >
                        Pause
                      </Button>
                    ) : (
                      <Button
                        variant="secondary"
                        disabled={isBusy}
                        onClick={() => run(sub.id, () => resumeMealSubscription(sub.id))}
                      >
                        Resume
                      </Button>
                    )}
                    <button
                      type="button"
                      className={styles.linkButton}
                      aria-expanded={isOpen}
                      onClick={() => void toggleExpanded(sub.id)}
                    >
                      {isOpen ? "Hide meals" : "See every meal"}
                    </button>
                    <button
                      type="button"
                      className={styles.cancelButton}
                      disabled={isBusy}
                      onClick={() => {
                        // Cancelling moves no money, and somebody about to
                        // lose prepaid meals should be told that before it
                        // happens rather than discovering it afterwards.
                        const ok = window.confirm(
                          `Cancel this plan? You have ${sub.mealsRemaining} meal${
                            sub.mealsRemaining === 1 ? "" : "s"
                          } left. Cancelling does not refund them automatically — contact support if you need a refund.`,
                        );
                        if (ok) void run(sub.id, () => cancelMealSubscription(sub.id));
                      }}
                    >
                      Cancel plan
                    </button>
                  </div>
                )}

                {isOpen && deliveriesById[sub.id] && (
                  <ul className={styles.deliveries}>
                    {deliveriesById[sub.id]!.map((delivery) => (
                      <li key={delivery.id} className={styles.delivery}>
                        <span className={styles.deliveryDate}>
                          {formatDate(delivery.scheduledFor)}
                        </span>
                        <span className={styles.deliveryWindow}>{delivery.bracketLabel}</span>
                        <span className={clsx(styles.deliveryStatus, styles[`d_${delivery.status}`])}>
                          {DELIVERY_STATUS_COPY[delivery.status]}
                        </span>
                        {/* The server has always sent a `reason` (e.g.
                            "Subscription paused") and nothing rendered it,
                            so a buyer saw a status and no explanation for
                            a meal they had paid for. */}
                        {delivery.status !== "scheduled" && delivery.status !== "delivered" && (
                          <span className={styles.deliveryReason}>
                            {delivery.reason ?? DELIVERY_STATUS_NOTE[delivery.status]}
                          </span>
                        )}
                        {delivery.status === "scheduled" && sub.status === "active" && (
                          <button
                            type="button"
                            className={styles.skipButton}
                            disabled={isBusy}
                            onClick={() =>
                              run(sub.id, () => skipMealDelivery(sub.id, delivery.id))
                            }
                          >
                            Skip
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                )}

                {isOpen && !deliveriesById[sub.id] && (
                  <p className={styles.deliveriesNote}>Loading your meals…</p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
