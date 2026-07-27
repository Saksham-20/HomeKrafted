"use client";

import { useAuth } from "@/lib/auth/AuthContext";
import { MakerOrderDetailClient } from "./MakerOrderDetailClient";
import { SnackOrderDetailClient } from "./SnackOrderDetailClient";

export interface SellerOrderDetailClientProps {
  orderId: string;
}

/**
 * `/seller/orders/[id]` — M10b type router, same reasoning as
 * `SellerOrdersClient` above (a maker `Order` and a snack `SnackOrder`
 * are unrelated shapes with unrelated status unions, so each gets its
 * own detail screen; this only picks which one to render).
 */
export function SellerOrderDetailClient({ orderId }: SellerOrderDetailClientProps) {
  const { seller } = useAuth();

  if (seller?.type === "snack") {
    return <SnackOrderDetailClient orderId={orderId} />;
  }
  return <MakerOrderDetailClient orderId={orderId} />;
}
