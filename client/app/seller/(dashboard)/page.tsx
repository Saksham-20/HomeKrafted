import { SellerDashboardClient } from "@/components/seller/SellerDashboardClient";

/** `/seller` — Dashboard. Thin server wrapper; all data is owner-scoped client state, see `SellerDashboardClient`. */
export default function SellerDashboardPage() {
  return <SellerDashboardClient />;
}
