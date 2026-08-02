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

/** Header primary nav — collapses into <MobileDrawer> under ~840px. */
export const primaryNav: NavLink[] = [
  { label: "Shop", href: "/shop" },
  { label: "Build a Hamper", href: "/hamper" },
  { label: "Laundry", href: "/laundry" },
  { label: "Snacks", href: "/snacks" },
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
      { label: "Homemade Foods", href: "/shop" },
      { label: "Gift Hampers", href: "/hamper" },
      { label: "Laundry & Cleaning", href: "/laundry" },
      { label: "Food Delivery (app)", href: "/app-promo" },
      { label: "Corporate gifting", href: "/corporate" },
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
    // Copy reflects the held builder (the `hamperBuilder` flag, lib/features/).
    // When it goes live, revert to "Customisable" / "Start building →".
    eyebrow: "Customisable · coming soon",
    title: "Build your own\ngift hamper",
    description:
      "Pick a box, fill it with favourites, add a handwritten message card and gift wrap. We pack it beautifully — launching with the festive season.",
    ctaLabel: "See what's coming →",
    ctaHref: "/hamper",
  },
  {
    id: "wallet",
    variant: "tint",
    eyebrow: "Homekrafted Wallet",
    title: "Earn 5% cashback\non every order",
    description:
      "Top up once, pay in a tap, and watch rewards add up across the store and laundry.",
    ctaLabel: "Open wallet →",
    ctaHref: "/wallet",
  },
];
