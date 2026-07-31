import type { Metadata } from "next";
import { CorporateInquiryClient } from "@/components/corporate/CorporateInquiryClient";
import { getCorporateBudgetRanges, getCorporateOccasions } from "@/lib/api";
import { pageMetadata } from "@/lib/seo";

/** `/corporate` (M7b) — bulk gifting inquiry form, standalone route. */
export const metadata: Metadata = pageMetadata({
  title: "Corporate gifting",
  description:
    "Bulk festive hampers and curated corporate gifts, assembled from tricity home kitchens. Tell us headcount and budget and we'll come back with options.",
  path: "/corporate",
});

export default async function CorporatePage() {
  const [occasions, budgetRanges] = await Promise.all([
    getCorporateOccasions(),
    getCorporateBudgetRanges(),
  ]);

  return <CorporateInquiryClient occasions={occasions} budgetRanges={budgetRanges} />;
}
