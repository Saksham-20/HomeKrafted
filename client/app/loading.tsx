import { RouteSkeleton } from "@/components/feedback/RouteSkeleton";

/**
 * Default route-level loading state. Server pages that fetch (`/shop`,
 * `/product/[slug]`, `/storefront/[vendor]`, …) stream in behind this
 * instead of leaving the previous page frozen under a browser spinner.
 * Listing-shaped routes that want a grid drop their own `loading.tsx`
 * next to the page.
 */
export default function Loading() {
  return <RouteSkeleton variant="page" count={3} label="Loading page…" />;
}
