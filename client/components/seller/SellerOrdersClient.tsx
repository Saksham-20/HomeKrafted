"use client";

import { useAuth } from "@/lib/auth/AuthContext";
import { MakerOrdersClient } from "./MakerOrdersClient";
import { SnackOrdersClient } from "./SnackOrdersClient";

/**
 * `/seller/orders` — a HomeKrafter's incoming work.
 *
 * Was a router over `seller.type`: marketplace orders for a maker, WhatsApp
 * snack orders for a snack seller, and nothing at all for a laundry
 * partner. One role means one account can have both, so both render, each
 * resolving its own data and its own empty state.
 *
 * Still two components rather than one merged list: an `Order` and a
 * `SnackOrder` are genuinely different entities with different statuses and
 * different fulfilment steps (see `lib/types/food.ts#SnackOrder`), and
 * flattening them would mean inventing a status vocabulary that fits
 * neither.
 */
export function SellerOrdersClient() {
  const { seller } = useAuth();
  const takesSnackOrders = seller?.specialties.includes("snacks") ?? false;

  return (
    <>
      <MakerOrdersClient />
      {/* Only for HomeKrafters who actually take WhatsApp snack orders —
          otherwise this is a permanently empty section on every page load. */}
      {takesSnackOrders && <SnackOrdersClient />}
    </>
  );
}
