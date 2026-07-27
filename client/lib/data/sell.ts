import type { SellerApplication, SellerApplicationCategory } from "@/lib/types";

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

/**
 * M11a — seeds `/admin/sellers`' onboarding approval queue with real
 * applications on first load, rather than starting empty and only ever
 * filling up from someone submitting `/sell`'s form this session. Three
 * pending (spanning `new`/`reviewing`/`waitlisted` — the queue treats all
 * three as "pending", see `SellerApplicationStatus`'s doc comment) plus
 * one already `rejected`, so the admin screen has both an active queue
 * and decided history to show without any live action first.
 * `lib/api/sell.ts` splices these into its live `sellerApplications`
 * array at module init — same seed-then-mutate-in-place pattern as
 * `lib/data/orders.ts#seedOrders` vs. `lib/api/orders.ts`'s live list.
 */
export const seedSellerApplications: SellerApplication[] = [
  {
    id: "sa-seed-1",
    businessName: "Kaveri's Kitchen",
    contactName: "Kaveri Rao",
    email: "kaveri@example.com",
    phone: "+91 90001 11222",
    category: "maker",
    city: "Mysuru, Karnataka",
    description:
      "Traditional Karnataka pickles and podis, small-batch, home-kitchen made — my grandmother's recipes, no preservatives.",
    status: "new",
    createdAt: "2026-07-20T10:00:00+05:30",
  },
  {
    id: "sa-seed-2",
    businessName: "Sugar & Slate Bakes",
    contactName: "Rohan Mehta",
    email: "rohan@example.com",
    phone: "+91 90002 22333",
    category: "baker",
    city: "Pune, Maharashtra",
    description: "Eggless cakes and festive bakes for small home celebrations, made to order.",
    status: "reviewing",
    createdAt: "2026-07-21T14:30:00+05:30",
  },
  {
    id: "sa-seed-3",
    businessName: "Terracotta & Thread",
    contactName: "Ila Bhatt",
    email: "ila@example.com",
    phone: "+91 90003 33444",
    category: "artist",
    city: "Jaipur, Rajasthan",
    description: "Hand-painted terracotta décor and block-printed textile gifting pieces.",
    status: "waitlisted",
    createdAt: "2026-07-15T09:00:00+05:30",
  },
  {
    id: "sa-seed-4",
    businessName: "Coastal Crate Co.",
    contactName: "Manoj Pillai",
    email: "manoj@example.com",
    phone: "+91 90004 44555",
    category: "other",
    city: "Kochi, Kerala",
    description: "Curated coastal Kerala snack and spice hampers.",
    status: "rejected",
    createdAt: "2026-07-10T09:00:00+05:30",
  },
];
