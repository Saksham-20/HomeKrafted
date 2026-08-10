import { RouteSkeleton } from "@/components/feedback/RouteSkeleton";
import { kitchenLoading } from "@/lib/kitchen-copy";

/**
 * Safe to put a loading boundary here: `/snacks` never calls
 * `notFound()`. See `app/shop/loading.tsx` for why that matters.
 */
export default function SnacksLoading() {
  return <RouteSkeleton variant="grid" count={8} message={kitchenLoading("snacks")} />;
}
