import { CorporateInquiryClient } from "@/components/corporate/CorporateInquiryClient";
import { getCorporateBudgetRanges, getCorporateOccasions } from "@/lib/api";

/** `/corporate` (M7b) — bulk gifting inquiry form, standalone route. */
export default async function CorporatePage() {
  const [occasions, budgetRanges] = await Promise.all([
    getCorporateOccasions(),
    getCorporateBudgetRanges(),
  ]);

  return <CorporateInquiryClient occasions={occasions} budgetRanges={budgetRanges} />;
}
