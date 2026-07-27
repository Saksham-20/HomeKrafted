"use client";

import { useAuth } from "@/lib/auth/AuthContext";
import { MakerOrdersClient } from "./MakerOrdersClient";
import { SnackOrdersClient } from "./SnackOrdersClient";

/**
 * `/seller/orders` — M10b type router. A maker's `Order`s and a snack
 * seller's `SnackOrder`s are different entities entirely (see
 * `lib/types/food.ts`'s `SnackOrder` doc comment for why), so this stays
 * a thin switch over two sibling components rather than one component
 * branching mid-render — same "no conditional hooks" reasoning as
 * `SellerDashboardClient`. Laundry sellers have no `/seller/orders` nav
 * entry (`SellerShell`'s `LAUNDRY_NAV` uses `/seller/pickups` instead),
 * so `default` here just falls back to the maker view rather than adding
 * a third branch nothing links to.
 */
export function SellerOrdersClient() {
  const { seller } = useAuth();

  if (seller?.type === "snack") {
    return <SnackOrdersClient />;
  }
  return <MakerOrdersClient />;
}
