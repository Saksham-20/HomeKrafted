"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import clsx from "clsx";
import { Button } from "@/components/ui/Button";
import { useAuth } from "@/lib/auth/AuthContext";
import { ApiError } from "@/lib/api/http";
import { createMealSubscription, getAddresses } from "@/lib/api";
import { formatCurrency } from "@/lib/format";
import { MEAL_COUNTS, type Address, type MealPlan } from "@/lib/types";
import styles from "./MealPlanSubscribeClient.module.css";

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** `"12:30"` → `"12:30–13:00"`, matching the server's own bracket label. */
function bracketLabel(start: string): string {
  const [h, m] = start.split(":").map(Number);
  const end = (h * 60 + m + 30) % 1440;
  const eh = String(Math.floor(end / 60)).padStart(2, "0");
  const em = String(end % 60).padStart(2, "0");
  return `${start}–${eh}:${em}`;
}

export interface MealPlanSubscribeClientProps {
  plan: MealPlan;
}

/**
 * The subscribe form. **This spends money** — one wallet debit for the
 * whole cycle — so three things are non-negotiable here:
 *
 * 1. The total is shown before the button, not after. Nobody should press
 *    "subscribe" to find out what it costs.
 * 2. Every failure is surfaced in an `aria-live` region. A `402` (balance
 *    too low), `409` (plan full) and `400` (window not offered) each carry
 *    a message the buyer must read — swallowing them is the exact
 *    silent-failure class M19 removed from three other forms.
 * 3. An idempotency key is minted per attempt, so a double-tap or a retry
 *    on a flaky connection cannot charge twice.
 */
export function MealPlanSubscribeClient({ plan }: MealPlanSubscribeClientProps) {
  const router = useRouter();
  const { isSignedIn, ready } = useAuth();

  const [addresses, setAddresses] = useState<Address[]>([]);
  const [addressId, setAddressId] = useState("");
  const [bracketStart, setBracketStart] = useState(plan.brackets[0] ?? "");
  const [daysOfWeek, setDaysOfWeek] = useState<number[]>([1, 2, 3, 4, 5]);
  const [mealCount, setMealCount] = useState<number>(12);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!ready || !isSignedIn) return;
    let cancelled = false;
    getAddresses()
      .then((list) => {
        if (cancelled) return;
        setAddresses(list);
        setAddressId(list.find((a) => a.isDefault)?.id ?? list[0]?.id ?? "");
      })
      .catch(() => {
        if (!cancelled) setError("We couldn't load your saved addresses. Reload and try again.");
      });
    return () => {
      cancelled = true;
    };
  }, [ready, isSignedIn]);

  const total = useMemo(() => plan.pricePerMeal * mealCount, [plan.pricePerMeal, mealCount]);

  function toggleDay(day: number) {
    setDaysOfWeek((current) =>
      current.includes(day) ? current.filter((d) => d !== day) : [...current, day].sort(),
    );
  }

  async function handleSubscribe() {
    setError(null);
    if (daysOfWeek.length === 0) {
      setError("Pick at least one day of the week.");
      return;
    }
    if (!addressId) {
      setError("Add a delivery address before starting a plan.");
      return;
    }

    setBusy(true);
    try {
      const subscription = await createMealSubscription(
        { planId: plan.id, addressId, bracketStart, daysOfWeek, mealCount },
        // One key per attempt. Regenerated on a retry the user chose,
        // reused by the browser on a resend it didn't.
        `meal-${plan.id}-${Date.now()}`,
      );
      router.push(`/account/subscriptions?new=${subscription.id}`);
    } catch (err) {
      // Named, not generic. The server's messages here are the useful
      // ones: which window the kitchen offers, that the plan filled up,
      // how short the wallet is.
      setError(
        err instanceof ApiError
          ? err.message
          : "Something went wrong starting your plan — please try again.",
      );
      setBusy(false);
    }
  }

  if (!ready) return <p className={styles.loading}>Loading…</p>;

  if (!isSignedIn) {
    return (
      <div className={styles.signedOut}>
        <p>
          Sign in to start a meal plan — we need somewhere to deliver it and a wallet to pay
          from.
        </p>
        <Link href={`/login?next=/meal-plans/${plan.slug}`} className={styles.signInCta}>
          Sign in to subscribe →
        </Link>
      </div>
    );
  }

  return (
    <div className={styles.form}>
      <fieldset className={styles.field}>
        <legend className={styles.legend}>Which days?</legend>
        <div className={styles.dayRow}>
          {DAY_LABELS.map((label, day) => (
            <button
              key={label}
              type="button"
              className={clsx(styles.day, daysOfWeek.includes(day) && styles.dayOn)}
              aria-pressed={daysOfWeek.includes(day)}
              onClick={() => toggleDay(day)}
            >
              {label}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset className={styles.field}>
        <legend className={styles.legend}>Delivery window</legend>
        <div className={styles.bracketRow}>
          {plan.brackets.map((bracket) => (
            <button
              key={bracket}
              type="button"
              className={clsx(styles.bracket, bracketStart === bracket && styles.bracketOn)}
              aria-pressed={bracketStart === bracket}
              onClick={() => setBracketStart(bracket)}
            >
              {bracketLabel(bracket)}
            </button>
          ))}
        </div>
        <p className={styles.hint}>
          A 30-minute window, not a promise to the minute — a home kitchen cooks to order.
        </p>
      </fieldset>

      <fieldset className={styles.field}>
        <legend className={styles.legend}>How many meals?</legend>
        <div className={styles.countRow}>
          {MEAL_COUNTS.map((count) => (
            <button
              key={count}
              type="button"
              className={clsx(styles.count, mealCount === count && styles.countOn)}
              aria-pressed={mealCount === count}
              onClick={() => setMealCount(count)}
            >
              {count} meals
            </button>
          ))}
        </div>
      </fieldset>

      <div className={styles.field}>
        <label className={styles.legend} htmlFor="meal-address">
          Deliver to
        </label>
        {addresses.length === 0 ? (
          <p className={styles.hint}>
            You have no saved addresses yet.{" "}
            <Link href="/account/addresses">Add one</Link> and come back.
          </p>
        ) : (
          <select
            id="meal-address"
            className={styles.select}
            value={addressId}
            onChange={(e) => setAddressId(e.target.value)}
          >
            {addresses.map((address) => (
              <option key={address.id} value={address.id}>
                {address.label} — {address.line1}, {address.city}
              </option>
            ))}
          </select>
        )}
      </div>

      {/*
        The total, before the button. This is a single debit for the whole
        cycle, and the one number that decides whether somebody presses it.
      */}
      <div className={styles.total}>
        <div>
          <span className={styles.totalLabel}>Total today</span>
          <span className={styles.totalValue}>{formatCurrency(total)}</span>
        </div>
        <p className={styles.totalNote}>
          {mealCount} meals × {formatCurrency(plan.pricePerMeal)}, paid once from your wallet.
          Nothing charges you again — skip a day and the meal is owed back to you.
        </p>
      </div>

      {/*
        `role="alert"` plus `aria-live` so a screen reader is told about a
        refused payment without having to go looking for it.
      */}
      <div aria-live="polite" role="alert" className={styles.errorRegion}>
        {error && <p className={styles.error}>{error}</p>}
      </div>

      <Button
        variant="primary"
        onClick={handleSubscribe}
        disabled={busy || addresses.length === 0}
      >
        {busy ? "Starting your plan…" : `Start plan · ${formatCurrency(total)}`}
      </Button>
    </div>
  );
}
