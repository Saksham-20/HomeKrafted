import { SellerApplicationClient } from "@/components/sell/SellerApplicationClient";
import { getSellerBenefits, getSellerCategories, getSellerSteps } from "@/lib/api";

/** `/sell` (M7b) — seller onboarding info + application form, future-flagged per the plan. */
export default async function SellPage() {
  const [benefits, steps, categories] = await Promise.all([
    getSellerBenefits(),
    getSellerSteps(),
    getSellerCategories(),
  ]);

  return <SellerApplicationClient benefits={benefits} steps={steps} categories={categories} />;
}
