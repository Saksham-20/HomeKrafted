import { Suspense } from "react";
import { SubscriptionsListClient } from "@/components/account/SubscriptionsListClient";

/**
 * Meal subscriptions the buyer holds (M20).
 *
 * This route is where `MealPlanSubscribeClient` sends somebody the instant
 * their wallet is debited, so it is the first thing they see after paying.
 * It shipped one commit late — the redirect landed on a 404 — which is the
 * worst possible moment for one.
 *
 * Client-fetched rather than server-fetched for the same reason
 * `OrdersListClient` is: a subscription created live in this browser
 * session has to appear immediately, and the `?new=` highlight below only
 * means anything if the row is there to highlight.
 */
export default function SubscriptionsPage() {
  /*
    The Suspense boundary is required, not decorative: the client reads
    `?new=` through `useSearchParams`, which opts the subtree into
    client-side bailout and fails the build without one.

    It is safe here in a way it would not be on `/meal-plans/[slug]`. This
    route never calls `notFound()`, so there is no status line for a
    streaming boundary to lock in before the body runs — which is the
    soft-404 CLAUDE.md warns about. Boundaries are fine; it is
    `loading.tsx` over a `notFound()`-capable route that is not.
  */
  return (
    <Suspense fallback={<p>Loading your meal plans…</p>}>
      <SubscriptionsListClient />
    </Suspense>
  );
}
