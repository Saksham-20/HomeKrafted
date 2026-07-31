import { RouteSkeleton } from "@/components/feedback/RouteSkeleton";

/**
 * Grid-shaped placeholder — `/shop` is a card grid, so a stack of slabs
 * would reflow badly when the real page lands.
 *
 * **Why there is no app-wide `app/loading.tsx`.** A `loading.tsx` is a
 * Suspense boundary, and a dynamic route behind one starts streaming its
 * response — status line included — before the page body runs. A
 * `notFound()` after that point can no longer set 404, so the visitor
 * gets the right page with a **200**: a soft 404, which is one of the
 * worse things a catalogue site can serve a crawler. Measured, not
 * assumed: with a root `loading.tsx`, `/product/nope` and
 * `/storefront/nope` returned 200; without it, 404.
 *
 * So loading boundaries live only on routes that never call
 * `notFound()` — this one, `/search`, `/snacks` — plus the seller and
 * admin dashboards, where the skeleton is worth more than a status code
 * on paths `robots.ts` disallows anyway.
 */
export default function ShopLoading() {
  return <RouteSkeleton variant="grid" count={8} label="Loading the marketplace…" />;
}
