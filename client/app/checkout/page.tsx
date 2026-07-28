import { getDeliveryDateOptions } from "@/lib/api";
import { CheckoutClient } from "@/components/checkout/CheckoutClient";

/**
 * Checkout (M3; M8.4a swap) — server wrapper: fetches the (still static,
 * non-auth) delivery-date options. The address book + wallet balance used
 * to be fetched here too — both are owner-scoped real reads now, so
 * `CheckoutClient` fetches them itself on mount instead (same reasoning as
 * `LaundryBookingClient`).
 */
export default async function CheckoutPage() {
  const deliveryDateOptions = await getDeliveryDateOptions();

  return <CheckoutClient deliveryDateOptions={deliveryDateOptions} />;
}
