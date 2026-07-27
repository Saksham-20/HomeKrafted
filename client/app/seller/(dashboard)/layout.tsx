import type { ReactNode } from "react";
import { SellerShell } from "@/components/seller/SellerShell";

/**
 * Layout for every shelled seller route (`/seller`, `/seller/listings`,
 * `/seller/orders`, `/seller/storefront`, `/seller/payouts`,
 * `/seller/reviews`) — the `(dashboard)` route group excludes
 * `/seller/login`, which has no sidebar/topbar to show. See
 * `SellerShell` for the responsive behaviour and the client-side
 * role-gate fallback.
 */
export default function SellerDashboardLayout({ children }: { children: ReactNode }) {
  return <SellerShell>{children}</SellerShell>;
}
