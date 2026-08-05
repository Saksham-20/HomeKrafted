"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/Card";
import { SellerPageHeader } from "./SellerPageHeader";
import { MealDeliveryQueue } from "./MealDeliveryQueue";
import { ModuleUnavailable, isForbidden } from "./ModuleUnavailable";
import { useAuth } from "@/lib/auth/AuthContext";
import { getMyMealDeliveries } from "@/lib/api";
import type { SellerMealDelivery } from "@/lib/types";
import styles from "./MealPlansClient.module.css";

const HORIZON_DAYS = 14;

/**
 * `/seller/meal-plans/deliveries` — the whole fortnight of meals owed.
 *
 * `/seller/meal-plans` shows the next couple of days inline; this is where
 * a cook plans a shop. Same `MealDeliveryQueue`, longer horizon.
 */
export function MealDeliveriesClient() {
  const { ready, seller } = useAuth();
  const [deliveries, setDeliveries] = useState<SellerMealDelivery[]>([]);
  const [now, setNow] = useState<Date | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    if (!ready || !seller) return;
    let cancelled = false;
    (async () => {
      try {
        const rows = await getMyMealDeliveries(HORIZON_DAYS);
        if (cancelled) return;
        setDeliveries(rows);
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
  }, [ready, seller]);

  if (!ready || loading) {
    return <div className={styles.loading}>Loading your meals…</div>;
  }

  if (unavailable) {
    return <ModuleUnavailable module="Meal plans" />;
  }

  return (
    <div>
      <SellerPageHeader
        title="Meals to cook"
        subtitle={`${deliveries.length} meal${
          deliveries.length === 1 ? "" : "s"
        } owed over the next ${HORIZON_DAYS} days`}
      />

      {deliveries.length === 0 || !now ? (
        <Card className={styles.empty}>
          Nothing owed right now. Meals appear here the moment somebody
          subscribes to one of your plans.
        </Card>
      ) : (
        <MealDeliveryQueue
          deliveries={deliveries}
          now={now}
          onDelivered={(id) =>
            setDeliveries((current) => current.filter((d) => d.id !== id))
          }
        />
      )}
    </div>
  );
}
