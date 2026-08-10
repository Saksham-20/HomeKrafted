import { RouteSkeleton } from "@/components/feedback/RouteSkeleton";
import { kitchenLoading, MAKER_LOADING } from "@/lib/kitchen-copy";

/** Portal routes are row-shaped (listings, orders, pickups, payouts). */
export default function SellerLoading() {
  return <RouteSkeleton variant="list" count={6} message={kitchenLoading("seller/portal", MAKER_LOADING)} />;
}
