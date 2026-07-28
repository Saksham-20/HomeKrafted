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
 * `SellerDashboardClient`. Every HomeKrafter now sees an Orders nav entry
 * (`SellerShell`'s single `HOMEKRAFTER_NAV`), so a laundry partner does
 * reach this: they fall through to the maker view, whose own fetch
 * resolves to `ModuleUnavailable` when the API scopes them out. Their
 * day-to-day work lives under Pickups.
 */
export function SellerOrdersClient() {
  const { seller } = useAuth();

  if (seller?.type === "snack") {
    return <SnackOrdersClient />;
  }
  return <MakerOrdersClient />;
}
