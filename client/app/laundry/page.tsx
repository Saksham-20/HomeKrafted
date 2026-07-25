import {
  getDefaultAddress,
  getLaundryDays,
  getLaundryHowItWorks,
  getLaundryServices,
  getLaundrySlots,
  getLaundrySubscriptionPlanOptions,
  getWallet,
} from "@/lib/api";
import { LaundryBookingClient } from "@/components/laundry/LaundryBookingClient";

/**
 * Laundry, Cleaning & Ironing (M4) — server wrapper: fetches services,
 * pickup/delivery availability, the "how it works" strip, the wallet
 * (for the pay-with-wallet default + cashback preview) and the default
 * address (bookings need an `addressId`, same as Checkout — full
 * address-book selection here is a nice-to-have M7 could add, not part
 * of this milestone's scope), hands them to the client booking flow.
 * Ported from the prototype's Laundry screen
 * (`handoff/prototype/Homekrafted.dc.html`, `isLaundry` block), extended
 * with the spec'd pieces the prototype doesn't have yet (delivery slot,
 * dry-clean item count + photos, special instructions, subscription,
 * payment, mock confirmation) — see `CHANGELOG.md`'s M4 entry.
 */
export default async function LaundryPage() {
  const [services, days, slots, steps, subscriptionPlans, wallet, address] = await Promise.all([
    getLaundryServices(),
    getLaundryDays(),
    getLaundrySlots(),
    getLaundryHowItWorks(),
    getLaundrySubscriptionPlanOptions(),
    getWallet(),
    getDefaultAddress(),
  ]);

  return (
    <LaundryBookingClient
      services={services}
      days={days}
      slots={slots}
      steps={steps}
      subscriptionPlans={subscriptionPlans}
      wallet={wallet}
      addressId={address.id}
    />
  );
}
