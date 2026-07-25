import type { SellerApplicationCategory } from "@/lib/types";

/**
 * `/sell` content — seller onboarding is explicitly future-flagged per
 * the plan ("Seller onboarding *(future)* — `/sell` info + form
 * (flagged)"). This page is a real, submittable application form (mock),
 * clearly labelled "coming soon" rather than a live vendor dashboard —
 * see `SellerApplicationClient`'s banner copy.
 */

export interface SellerBenefit {
  title: string;
  description: string;
}

export const sellerBenefits: SellerBenefit[] = [
  {
    title: "Reach real homes",
    description: "Get discovered by shoppers already browsing homemade food, hampers and craft on Homekrafted.",
  },
  {
    title: "One wallet, no chasing payouts",
    description: "Settlements land in the same wallet ledger customers already use to pay — no separate payout app.",
  },
  {
    title: "Your own storefront",
    description: "A branded page with your story, rating and full product catalog, same as our founding makers.",
  },
  {
    title: "Support that knows makers",
    description: "A dedicated seller support line for packaging, listing photography and order questions.",
  },
];

export interface SellerStep {
  title: string;
  description: string;
}

export const sellerSteps: SellerStep[] = [
  { title: "Apply", description: "Tell us about what you make and where you're based." },
  { title: "We review", description: "Our team checks fit and reaches out for a short call." },
  { title: "Onboard", description: "List your first products with our packaging + photography guide." },
  { title: "Go live", description: "Your storefront opens once seller onboarding launches." },
];

export const sellerCategories: { value: SellerApplicationCategory; label: string }[] = [
  { value: "maker", label: "Maker (handmade goods, crafts)" },
  { value: "baker", label: "Baker (cakes, breads, bakes)" },
  { value: "artist", label: "Artist (art, decor, custom pieces)" },
  { value: "other", label: "Other" },
];
