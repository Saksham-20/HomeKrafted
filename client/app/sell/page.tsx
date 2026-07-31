import type { Metadata } from "next";
import { SellerApplicationClient } from "@/components/sell/SellerApplicationClient";
import { getSellerBenefits, getSellerCategories, getSellerSteps } from "@/lib/api";
import { pageMetadata } from "@/lib/seo";

/** `/sell` — seller onboarding info + application form. Real as of M9: submissions land in the admin approval queue (no longer future-flagged). */
export const metadata: Metadata = pageMetadata({
  title: "Sell your homemade food — become a HomeKrafter",
  description:
    "Turn your home kitchen into a storefront. List what you make, take orders from your own neighbourhood, and get paid — no shopfront, no commission on your first orders.",
  path: "/sell",
});

export default async function SellPage() {
  const [benefits, steps, categories] = await Promise.all([
    getSellerBenefits(),
    getSellerSteps(),
    getSellerCategories(),
  ]);

  return <SellerApplicationClient benefits={benefits} steps={steps} categories={categories} />;
}
