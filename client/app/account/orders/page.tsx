import { OrdersListClient } from "@/components/account/OrdersListClient";

/**
 * Unified order history (M7a) — no server-fetched props: `OrdersListClient`
 * fetches `getOrderHistory()` itself, client-side, on mount. That's
 * deliberate (not just "keep it simple") — see that component's comment:
 * fetching client-side lets it pick up any order/booking placed live
 * earlier in the same browser session (`lib/api/orders.ts`/`lib/api/
 * laundry.ts`'s in-memory arrays), which a server-side fetch here never
 * could (different module instance).
 */
export default function OrdersPage() {
  return <OrdersListClient />;
}
