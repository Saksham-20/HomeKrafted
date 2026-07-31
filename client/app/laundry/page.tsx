import type { Metadata } from "next";
import {
  getLaundryDays,
  getLaundryHowItWorks,
  getLaundryServices,
  getLaundrySlots,
  getLaundrySubscriptionPlanOptions,
} from "@/lib/api";
import { LaundryBookingClient } from "@/components/laundry/LaundryBookingClient";
import { pageMetadata } from "@/lib/seo";

/**
 * Laundry, Cleaning & Ironing (M4; M8.4a swap) — server wrapper: fetches
 * the `@Public()` services/availability/"how it works"/subscription-plan
 * reads. Ported from the prototype's Laundry screen
 * (`handoff/prototype/Homekrafted.dc.html`, `isLaundry` block), extended
 * with the spec'd pieces the prototype doesn't have yet (delivery slot,
 * dry-clean item count + photos, special instructions, subscription,
 * payment, confirmation) — see `CHANGELOG.md`'s M4 entry.
 *
 * M8.4a: the wallet (pay-with-wallet default) and default address used to
 * be fetched here too — both are owner-scoped real reads now, so
 * `LaundryBookingClient` fetches them itself on mount instead (same
 * reasoning as every other owner-scoped `lib/api` read post-M8.4a — see
 * `lib/auth/session.ts`'s file header).
 */
export const metadata: Metadata = pageMetadata({
  title: "Laundry, cleaning & ironing",
  description:
    "Wash & fold, dry cleaning, steam ironing and home cleaning across the Chandigarh tricity. Pick a pickup and a delivery slot, pay online or on delivery.",
  path: "/laundry",
});

export default async function LaundryPage() {
  const [services, days, slots, steps, subscriptionPlans] = await Promise.all([
    getLaundryServices(),
    getLaundryDays(),
    getLaundrySlots(),
    getLaundryHowItWorks(),
    getLaundrySubscriptionPlanOptions(),
  ]);

  return (
    <LaundryBookingClient
      services={services}
      days={days}
      slots={slots}
      steps={steps}
      subscriptionPlans={subscriptionPlans}
    />
  );
}
