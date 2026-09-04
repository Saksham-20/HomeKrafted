"use client";

import { useEffect, useState } from "react";
import { EmptyState } from "@/components/feedback/EmptyState";
import { LoadingRows } from "@/components/portal/LoadingRows";
import { SellerPageHeader } from "./SellerPageHeader";
import { MealDeliveryQueue } from "./MealDeliveryQueue";
import { ModuleUnavailable, isForbidden } from "./ModuleUnavailable";
import { useAuth } from "@/lib/auth/AuthContext";
import { apiErrorMessage, getMyMealDeliveries } from "@/lib/api";
import { kitchenLoading, MAKER_LOADING } from "@/lib/kitchen-copy";
import type { SellerMealDelivery } from "@/lib/types";
import styles from "./MealPlansClient.module.css";
import { Notice } from "@/components/portal/Notice";
import { Button } from "@/components/ui/Button";

const HORIZON_DAYS = 14;

/**
 * `/seller/meal-plans/deliveries` — the whole fortnight of meals owed.
 *
 * `/seller/meal-plans` shows the next couple of days inline; this is where
 * a cook plans a shop. Same `MealDeliveryQueue`, longer horizon.
 */
export function MealDeliveriesClient() {
  const { sellerDataReady } = useAuth();
  const [deliveries, setDeliveries] = useState<SellerMealDelivery[]>([]);
  const [now, setNow] = useState<Date | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  // Fires as soon as we know a HomeKrafter is signed in: this screen's
  // read is JWT-scoped and ignores the `seller` record (`lib/api`), so
  // waiting for `GET /seller/me` was a round trip in front of a request
  // that never used its answer.
  useEffect(() => {
    if (!sellerDataReady) return;
    let cancelled = false;
    (async () => {
      try {
        const rows = await getMyMealDeliveries(HORIZON_DAYS);
        if (cancelled) return;
        setDeliveries(rows);
        setNow(new Date());
      } catch (error) {
        if (cancelled) return;
        if (isForbidden(error)) {
          setUnavailable(true);
          return;
        }
        // A failed read is not an empty screen. Rethrowing here reached no
        // boundary (an effect's rejection is not a render error), so a
        // rate-limited fetch rendered the empty state over real data — the
        // M37 dashboard rule, applied to every list (2026-09-04).
        setLoadError(apiErrorMessage(error, "Couldn't load the meals you owe. Try again."));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sellerDataReady, reloadToken]);

  if (!sellerDataReady || loading) {
    return (
      <div>
        <SellerPageHeader title="Meals to cook" />
        <LoadingRows rows={4} showLabel label={kitchenLoading("seller/meal-deliveries", MAKER_LOADING)} />
      </div>
    );
  }

  if (loadError) {
    return (
      <div>
        <SellerPageHeader title="Meals to cook" />
        <Notice
          tone="danger"
          actions={
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setLoadError(null);
                setLoading(true);
                setReloadToken((n) => n + 1);
              }}
            >
              Try again
            </Button>
          }
        >
          {loadError}
        </Notice>
      </div>
    );
  }

  if (unavailable) {
    return <ModuleUnavailable module="Meal plans" />;
  }

  return (
    <div>
      <SellerPageHeader
        back={{ href: "/seller/meal-plans", label: "Meal plans" }}
        title="Meals to cook"
        subtitle={`${deliveries.length} meal${
          deliveries.length === 1 ? "" : "s"
        } owed over the next ${HORIZON_DAYS} days`}
      />

      {deliveries.length === 0 || !now ? (
        <EmptyState
          title="Nothing owed right now."
          body="Meals appear here the moment somebody subscribes to one of your plans."
          action={{ href: "/seller/meal-plans", label: "Your plans" }}
        />
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
