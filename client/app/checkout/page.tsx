import type { Metadata } from "next";
import { CheckoutClient } from "@/components/checkout/CheckoutClient";

/**
 * Checkout (M3; M8.4a swap) — server wrapper, and now a thin one.
 *
 * It used to fetch the delivery-date options here and hand them down.
 * They roll from tomorrow and were a module-scope `const`, so this
 * Server Component captured them **once per process**: a box up for
 * three days offered every buyer a picker starting two days in the past.
 * The address book and wallet moved into the client for being
 * owner-scoped; the dates move for the M12 reason — anything keyed on
 * the current time is computed after mount, where "today" is the
 * buyer's and not the VPS's.
 */
/**
 * Never indexable: a checkout is per-visitor and behind a session. `robots.ts` disallows the path too — this is
 * the belt to that braces, for the case where a crawler reaches the page
 * from an external link rather than by crawling the site.
 */
export const metadata: Metadata = {
  title: "Checkout",
  robots: { index: false, follow: false },
};

export default function CheckoutPage() {
  return <CheckoutClient />;
}
