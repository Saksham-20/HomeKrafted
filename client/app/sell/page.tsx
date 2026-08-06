import type { Metadata } from "next";
import { SellerApplicationClient } from "@/components/sell/SellerApplicationClient";
import { getSellerBenefits, getSellerSteps } from "@/lib/api";
import { pageMetadata } from "@/lib/seo";

/** `/sell` — seller onboarding info + application form. Real as of M9: submissions land in the admin approval queue (no longer future-flagged). */
export const metadata: Metadata = pageMetadata({
  // M22 — "homemade food" and "home kitchen" turned away half the supply
  // this marketplace is for. A candle maker reading the title of this page
  // learns it is not for them before reaching the form.
  title: "Sell what you make — become a HomeKrafter",
  description:
    "Turn what you make at home into a storefront — food, candles, ceramics, textiles, jewellery, anything homemade. List it, take orders from your own neighbourhood, and get paid — no shopfront, no commission on your first orders.",
  path: "/sell",
});

export default async function SellPage() {
  // `getSellerCategories()` is gone from this page (M22): the form no
  // longer asks applicants to file themselves as a maker/baker/artist
  // before saying what they make. The server derives it from specialties.
  const [benefits, steps] = await Promise.all([getSellerBenefits(), getSellerSteps()]);

  return <SellerApplicationClient benefits={benefits} steps={steps} />;
}
