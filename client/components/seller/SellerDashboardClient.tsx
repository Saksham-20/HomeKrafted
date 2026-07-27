"use client";

import { useAuth } from "@/lib/auth/AuthContext";
import { MakerDashboardClient } from "./MakerDashboardClient";
import { PartnerDashboardClient } from "./PartnerDashboardClient";
import { SnackDashboardClient } from "./SnackDashboardClient";
import styles from "./SellerDashboardClient.module.css";

/**
 * `/seller` Dashboard — M10b type router. Each seller type's dashboard
 * needs a genuinely different snapshot shape (today's orders/revenue for
 * a maker vs. today's pickups/deliveries for a laundry partner vs.
 * incoming-orders/menu-size for a snack seller — see
 * `lib/api/seller.ts`'s `SellerDashboardSnapshot`/`PartnerDashboardSnapshot`/
 * `SnackDashboardSnapshot`), so this stays a thin switch over three
 * sibling components rather than one component branching mid-render —
 * that would call a different number of hooks depending on `seller.type`,
 * which `react-hooks/rules-of-hooks` (rightly) forbids. Each sibling
 * calls `useAuth()` itself; this component only needs it to pick which
 * one to render.
 */
export function SellerDashboardClient() {
  const { ready, seller } = useAuth();

  if (!ready || !seller) {
    return <div className={styles.loading}>Loading your dashboard…</div>;
  }

  switch (seller.type) {
    case "laundry":
      return <PartnerDashboardClient />;
    case "snack":
      return <SnackDashboardClient />;
    case "maker":
    default:
      return <MakerDashboardClient />;
  }
}
