import { RouteSkeleton } from "@/components/feedback/RouteSkeleton";

/** Portal routes are row-shaped (listings, orders, pickups, payouts). */
export default function SellerLoading() {
  return <RouteSkeleton variant="list" count={6} label="Loading your portal…" />;
}
