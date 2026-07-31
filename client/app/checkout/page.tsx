import type { Metadata } from "next";
import { getDeliveryDateOptions } from "@/lib/api";
import { CheckoutClient } from "@/components/checkout/CheckoutClient";

/**
 * Checkout (M3; M8.4a swap) — server wrapper: fetches the (still static,
 * non-auth) delivery-date options. The address book + wallet balance used
 * to be fetched here too — both are owner-scoped real reads now, so
 * `CheckoutClient` fetches them itself on mount instead (same reasoning as
 * `LaundryBookingClient`).
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

export default async function CheckoutPage() {
  const deliveryDateOptions = await getDeliveryDateOptions();

  return <CheckoutClient deliveryDateOptions={deliveryDateOptions} />;
}
