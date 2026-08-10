import type { SellerApplication, SellerApplicationCategory } from "@/lib/types";

/**
 * `/sell` content — the HomeKrafter application page.
 *
 * **Onboarding is live, and this file used to say it wasn't.** Everything
 * above described a future-flagged, mock, "coming soon" page: true when it
 * was written, false since M9 gave the form a real endpoint, M12 made
 * every approved application a full HomeKrafter, and M17/M21 gave them a
 * way to sign in. The "Go live" step still read *"your storefront opens
 * once HomeKrafter onboarding launches"* — so the live site told every
 * applicant that the thing they had just applied for did not exist yet.
 * That shipped to production and is the likeliest reason onboarding was
 * reported as broken when the flow itself worked end to end.
 *
 * **The steps below are the real mechanics, walked in a browser.** Apply →
 * an admin approves in `/admin/sellers` → approval mints a single-use
 * 7-day set-password link (`SellerInviteService`) sent by email and SMS →
 * they set a password and land in `/seller` → listings they add are
 * `pending` until reviewed (M22). If you change the flow, change these
 * four strings with it: they are the only description of it a maker ever
 * reads, and nothing fails when they drift.
 *
 * Don't restore a "coming soon" caveat here. The one thing still missing
 * is a *provider key* — with SendGrid and Twilio unset the invite degrades
 * to a logged stub and the admin screen says so, which is a server-config
 * gap, not a reason to tell makers the product is unbuilt.
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
    description: "A dedicated HomeKrafter support line for packaging, listing photography and order questions.",
  },
];

export interface SellerStep {
  title: string;
  description: string;
}

export const sellerSteps: SellerStep[] = [
  {
    title: "Apply",
    description: "Tell us what you make and which area you work from. One form, no fee to list.",
  },
  {
    title: "We read it",
    description: "A person reads every application. We get in touch once a decision is made.",
  },
  {
    title: "Set your password",
    description:
      "If you're approved, we send you a one-time link to choose a password. That opens your HomeKrafter dashboard.",
  },
  {
    title: "Add your items",
    description:
      "Add what you make, with your own photos and prices. Each item is checked once before it shows up in the shop.",
  },
];

/**
 * **No longer rendered anywhere (M22)** — the `/sell` form stopped asking
 * applicants to classify themselves, so the "order matters, index 0 is the
 * default selection" rule that used to live here no longer applies. Kept
 * so `getSellerCategories()` still resolves and so an admin screen reading
 * a legacy application's `category` has labels for it.
 */
export const sellerCategories: { value: SellerApplicationCategory; label: string }[] = [
  { value: "home_chef", label: "Home chef (food)" },
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
    city: "Chandigarh",
    area: "chd-sector-34",
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
    city: "Mohali",
    area: "moh-phase-5",
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
    city: "Panchkula",
    area: "pkl-sector-11",
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
    city: "Zirakpur",
    area: "zkp-dhakoli",
    description: "Curated coastal Kerala snack and spice hampers.",
    status: "rejected",
    createdAt: "2026-07-10T09:00:00+05:30",
  },
];
