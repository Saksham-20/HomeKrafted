/**
 * Site-chrome content: header nav, announcement bar, footer columns and
 * the home page's trust strip. Not part of the Prisma-bound domain model
 * in `lib/types` — this is copy/config, seeded here so components stay
 * data-driven instead of hardcoding strings.
 */

export interface NavLink {
  label: string;
  href: string;
}

export interface FooterColumn {
  title: string;
  links: NavLink[];
}

export interface TrustStat {
  value: string;
  label: string;
}

export interface AnnouncementItem {
  text: string;
  /** Gold mono treatment for the lead item, per the design system. */
  emphasis?: boolean;
}

/**
 * Header primary nav — collapses into <MobileDrawer> under ~840px.
 *
 * M20 renames rather than re-routes. "Shop" became **Homemade Food**
 * because the site now sells two different things and "Shop" no longer
 * says which; `/shop` itself is unchanged, so every existing link, every
 * indexed URL and every `sitemap.ts` entry still resolves. Renaming the
 * route as well would have cost the SEO for nothing a visitor notices.
 *
 * "Snacks" is gone from the top level — it is a *category* of homemade
 * food in the client's structure, not a peer of it. `/snacks` still
 * exists and is still linked from the footer and the home page, because
 * it is a genuinely different ordering flow (WhatsApp, no cart).
 */
export const primaryNav: NavLink[] = [
  { label: "Homemade Food", href: "/shop" },
  { label: "Handcrafted Gifts", href: "/gifts" },
  { label: "Gift Hampers", href: "/hamper" },
  { label: "Occasions", href: "/collections" },
  { label: "About", href: "/about" },
];

export const announcementItems: AnnouncementItem[] = [
  { text: "✦ Cooked this morning in a home kitchen near you", emphasis: true },
  { text: "Chandigarh · Mohali · Panchkula · Zirakpur" },
  { text: "Freshly prepared · No preservatives" },
];

export const brandBlurb =
  "Home-cooked food, fresh bakes and small-batch pickles from real home kitchens across Chandigarh, Mohali, Panchkula and Zirakpur.";

export const footerColumns: FooterColumn[] = [
  {
    title: "Services",
    links: [
      { label: "Homemade Food", href: "/shop" },
      { label: "Handcrafted Gifts", href: "/gifts" },
      { label: "Gift Hampers", href: "/hamper" },
      { label: "Meal plans", href: "/meal-plans" },
      { label: "Snacks on WhatsApp", href: "/snacks" },
      { label: "Corporate & bulk", href: "/corporate" },
      { label: "Sell on Homekrafted", href: "/sell" },
    ],
  },
  {
    title: "Help",
    links: [
      { label: "About us", href: "/about" },
      { label: "Track order", href: "/account/orders" },
      { label: "Shipping & returns", href: "/support" },
      { label: "FAQ", href: "/support" },
      { label: "Support", href: "/support" },
      { label: "Contact us", href: "/contact" },
      { label: "Cancellation & refunds", href: "/refunds" },
    ],
  },
  {
    title: "Account",
    links: [
      { label: "Login", href: "/login" },
      { label: "Address book", href: "/account/addresses" },
      { label: "Wallet", href: "/wallet" },
      { label: "Referrals & loyalty", href: "/account/referrals" },
      { label: "Order history", href: "/account/orders" },
    ],
  },
];

/** Home hero trust strip ("200+ home chefs · 0 preservatives · 48 hr freshly made"). */
export const trustStats: TrustStat[] = [
  { value: "200+", label: "home chefs" },
  { value: "0", label: "preservatives" },
  { value: "48 hr", label: "freshly made" },
];

/**
 * Home page's two promo bands (M11b CMS, `/admin/collections`'s "Home
 * promo content" tab) — previously hardcoded JSX in `app/page.tsx`, now
 * data-driven so an admin edit writes into the same source Home reads
 * (real CMS wiring, not a form to nowhere) — see
 * `components/admin/HomePromoEditorClient.tsx`'s doc comment for the
 * client/server module-graph caveat on when that edit becomes visible.
 * `title` may contain a literal `"\n"` to preserve the original two-line
 * layout — `app/page.tsx` splits on it and interleaves `<br />`. `id` is
 * a stable slot key (`"hamper"` | `"wallet"`), not a free-form entity id
 * — the home page always renders exactly these two slots in this order,
 * only their copy is editable.
 */
export interface HomePromoBandContent {
  id: string;
  variant: "dark" | "tint";
  eyebrow: string;
  title: string;
  description: string;
  ctaLabel: string;
  ctaHref: string;
}

export const homePromoBands: HomePromoBandContent[] = [
  {
    id: "hamper",
    variant: "dark",
    // M18: the buyer-assembled builder is gone. A hamper is now put
    // together by the kitchen that makes what's inside it, so the copy
    // sells that rather than a configurator.
    eyebrow: "Made for gifting",
    title: "Gifts that\nfeel personal",
    description:
      "Thoughtfully curated hampers filled with homemade goodness, handcrafted treats and a whole lot of love.",
    ctaLabel: "Explore hampers →",
    ctaHref: "/hamper",
  },
  {
    // M20: this slot used to sell the wallet's 5% cashback. It now sells
    // meal subscriptions, which is the thing a visitor can newly do —
    // and the cashback line was the weaker of the two anyway, since it
    // advertised a reward rather than a reason to come back.
    //
    // The CTA points at a route that must exist before this ships. A
    // promo band linking into nothing is worse than no band.
    id: "wallet",
    variant: "tint",
    eyebrow: "Everyday homemade meals",
    title: "Ghar Ka Khana,\nEvery Day",
    description:
      "Homemade meal subscriptions for students, PGs, bachelors and working professionals. Fresh, comforting meals delivered to you, every day.",
    ctaLabel: "Explore meal plans →",
    ctaHref: "/meal-plans",
  },
];

/**
 * "Backed by" — the institutional strip under the home page.
 *
 * **These are claims about real organisations.** They are rendered as
 * plain text rather than logos on purpose: reproducing a mark is a
 * separate permission from stating a relationship, and we hold neither
 * in writing yet. Confirm each one before this goes in front of the
 * public — an unverified affiliation on a live site is a legal exposure,
 * not a copy nit.
 */
export interface BackerClaim {
  label: string;
  detail: string;
}

export const backedBy: BackerClaim[] = [
  {
    label: "Chandigarh United Nations Association",
    detail: "Social initiative supported by CUNA",
  },
  { label: "ISB AIC", detail: "Incubated at ISB Atal Incubation Centre" },
  { label: "CGC", detail: "Supported by CGC" },
];

/**
 * "Homemade, Your Way" — the four ways to order, replacing the M19
 * two-card services grid.
 *
 * Data-driven rather than four hardcoded JSX blocks because the set
 * changes with what the platform actually offers: laundry was removed
 * from the old grid in M19 and left a hole that had to be rebuilt by
 * hand. A list makes the next removal a deletion.
 */
export interface WayToOrder {
  id: string;
  index: string;
  eyebrow: string;
  title: string;
  description: string;
  ctaLabel: string;
  ctaHref: string;
  /** WhatsApp gets its own treatment — it is a different channel, not a page. */
  variant: "default" | "whatsapp" | "app";
}

export const waysToOrder: WayToOrder[] = [
  {
    id: "bulk",
    index: "01",
    eyebrow: "Celebrations & events",
    title: "Hosting? Food's sorted.",
    description:
      "Homemade food for birthdays, get-togethers, office events and celebrations, prepared fresh for your occasion.",
    ctaLabel: "Explore bulk orders →",
    ctaHref: "/corporate",
    variant: "default",
  },
  {
    id: "food",
    index: "02",
    eyebrow: "Order homemade food",
    title: "Craving something homemade?",
    description:
      "Discover fresh meals, snacks and regional favourites made by home chefs near you.",
    ctaLabel: "Order food →",
    ctaHref: "/shop",
    variant: "default",
  },
  {
    id: "whatsapp",
    index: "03",
    eyebrow: "Quick order",
    title: "Order directly on WhatsApp",
    description:
      "Know what you want? Browse today's menu and place your order directly with us on WhatsApp.",
    ctaLabel: "Order on WhatsApp →",
    ctaHref: "/snacks",
    variant: "whatsapp",
  },
  {
    id: "app",
    index: "04",
    eyebrow: "Homekrafted app",
    title: "Homemade, now in your pocket",
    description:
      "Discover home chefs, order your favourites and track your food, all from the Homekrafted app.",
    ctaLabel: "Get the app →",
    ctaHref: "/app-promo",
    variant: "app",
  },
];
