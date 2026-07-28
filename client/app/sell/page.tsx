import { SellerApplicationClient } from "@/components/sell/SellerApplicationClient";
import { getSellerBenefits, getSellerCategories, getSellerSteps } from "@/lib/api";

/** `/sell` — seller onboarding info + application form. Real as of M9: submissions land in the admin approval queue (no longer future-flagged). */
export default async function SellPage() {
  const [benefits, steps, categories] = await Promise.all([
    getSellerBenefits(),
    getSellerSteps(),
    getSellerCategories(),
  ]);

  return <SellerApplicationClient benefits={benefits} steps={steps} categories={categories} />;
}
