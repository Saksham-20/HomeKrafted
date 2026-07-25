import { getAddresses, getDeliveryDateOptions, getWallet } from "@/lib/api";
import { CheckoutClient } from "@/components/checkout/CheckoutClient";

/**
 * Checkout (M3) — server wrapper: fetches the saved address book, wallet
 * balance (for the pay-with-wallet option), and delivery-date options,
 * then hands them to the interactive client checkout.
 */
export default async function CheckoutPage() {
  const [addresses, wallet, deliveryDateOptions] = await Promise.all([
    getAddresses(),
    getWallet(),
    getDeliveryDateOptions(),
  ]);

  return (
    <CheckoutClient
      initialAddresses={addresses}
      wallet={wallet}
      deliveryDateOptions={deliveryDateOptions}
    />
  );
}
