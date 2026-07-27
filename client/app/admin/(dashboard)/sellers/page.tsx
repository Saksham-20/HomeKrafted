import { SellersClient } from "@/components/admin/SellersClient";

/** `/admin/sellers` — all sellers (unscoped) + the onboarding approval queue. */
export default function AdminSellersPage() {
  return <SellersClient />;
}
