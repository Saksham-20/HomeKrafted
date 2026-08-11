"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { SellerPageHeader } from "./SellerPageHeader";
import { MealPlanRow } from "./MealPlanRow";
import { MealDeliveryQueue } from "./MealDeliveryQueue";
import { ModuleUnavailable, isForbidden } from "./ModuleUnavailable";
import { useAuth } from "@/lib/auth/AuthContext";
import { closeMyMealPlan, getMyMealDeliveries, getMyMealPlans } from "@/lib/api";
import type { SellerMealDelivery, SellerMealPlan } from "@/lib/types";
import styles from "./MealPlansClient.module.css";

/** How many days of the queue get their own panel here. The rest live on `/seller/meal-plans/deliveries`. */
const NEXT_UP_DAYS = 2;

function dateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * `/seller/meal-plans` — a HomeKrafter's subscription plans, and the meals
 * they owe.
 *
 * The work queue sits **above** the plans on purpose. Editing a plan is
 * something a cook does once; "who am I cooking for this evening" is what
 * they open the portal for. Only the next couple of days get the space,
 * with the rest a click away — a full fortnight of rows would bury the
 * plans list underneath it.
 *
 * Until this screen existed the API was the only way in, so "HomeKrafters
 * decide what they sell on subscription" was true of the intention and not
 * of the software.
 */
export function MealPlansClient() {
  const router = useRouter();
  const { sellerDataReady } = useAuth();
  const [plans, setPlans] = useState<SellerMealPlan[]>([]);
  const [deliveries, setDeliveries] = useState<SellerMealDelivery[]>([]);
  /** Stamped when the fetch resolves — after mount, so nothing reads the clock during SSR. */
  const [now, setNow] = useState<Date | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);

  // Fires as soon as we know a HomeKrafter is signed in: this screen's
  // read is JWT-scoped and ignores the `seller` record (`lib/api`), so
  // waiting for `GET /seller/me` was a round trip in front of a request
  // that never used its answer.
  useEffect(() => {
    if (!sellerDataReady) return;
    let cancelled = false;
    (async () => {
      try {
        const [myPlans, myDeliveries] = await Promise.all([
          getMyMealPlans(),
          getMyMealDeliveries(14),
        ]);
        if (cancelled) return;
        setPlans(myPlans);
        setDeliveries(myDeliveries);
        setNow(new Date());
      } catch (error) {
        if (cancelled) return;
        if (!isForbidden(error)) throw error;
        setUnavailable(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sellerDataReady]);

  async function handleClose(planId: string) {
    const plan = plans.find((p) => p.id === planId);
    if (!plan) return;
    /*
      The wording matters more than the button does. Closing stops new
      subscribers and leaves every existing cycle running — those people
      prepaid — and a cook who reads this as "stop cooking" would walk away
      from meals they still owe.
    */
    const subscribers = plan.subscriberCount;
    const confirmed = window.confirm(
      `Stop taking new subscribers for "${plan.name}"?\n\n` +
        (subscribers > 0
          ? `The ${subscribers} ${subscribers === 1 ? "person" : "people"} already on it keep their meals — they've paid for those, and you still need to cook them. You can reopen the plan any time.`
          : "You can reopen it any time."),
    );
    if (!confirmed) return;
    const updated = await closeMyMealPlan(planId);
    setPlans((current) =>
      current.map((p) => (p.id === planId ? { ...p, isActive: updated.isActive } : p)),
    );
  }

  function handleDelivered(deliveryId: string) {
    setDeliveries((current) => current.filter((d) => d.id !== deliveryId));
  }

  if (!sellerDataReady || loading) {
    return <div className={styles.loading}>Loading your meal plans…</div>;
  }

  if (unavailable) {
    return <ModuleUnavailable module="Meal plans" />;
  }

  const horizon = now ? new Date(now) : undefined;
  if (horizon) horizon.setDate(horizon.getDate() + NEXT_UP_DAYS);
  const cutoff = horizon ? dateKey(horizon) : undefined;
  const nextUp = cutoff ? deliveries.filter((d) => d.scheduledFor < cutoff) : deliveries;
  const later = deliveries.length - nextUp.length;

  return (
    <div>
      <SellerPageHeader
        title="Meal plans"
        subtitle={`${plans.length} plan${plans.length === 1 ? "" : "s"} · ${deliveries.length} meal${
          deliveries.length === 1 ? "" : "s"
        } to cook in the next fortnight`}
        actions={
          <Button variant="primary" size="sm" onClick={() => router.push("/seller/meal-plans/new")}>
            <Plus size={16} strokeWidth={2} aria-hidden="true" />
            Add plan
          </Button>
        }
      />

      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <h2 className={styles.sectionTitle}>Coming up</h2>
          {later > 0 && (
            <Link href="/seller/meal-plans/deliveries" className={styles.sectionLink}>
              All {deliveries.length} meals →
            </Link>
          )}
        </div>

        {nextUp.length === 0 ? (
          <Card className={styles.empty}>
            {deliveries.length === 0
              ? "Nothing to cook yet. Meals appear here the moment somebody subscribes."
              : "Nothing in the next couple of days."}
          </Card>
        ) : (
          now && (
            <MealDeliveryQueue deliveries={nextUp} now={now} onDelivered={handleDelivered} />
          )
        )}
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Your plans</h2>
        {plans.length === 0 ? (
          <Card className={styles.empty}>
            No subscription plans yet. A plan is anything you&rsquo;d cook on a
            repeating basis — a daily tiffin, a weekly thali, a monthly pickle
            box. You set the price, the portion and how many people you can
            take.
          </Card>
        ) : (
          <div className={styles.list}>
            {plans.map((plan) => (
              <MealPlanRow key={plan.id} plan={plan} onClose={handleClose} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
