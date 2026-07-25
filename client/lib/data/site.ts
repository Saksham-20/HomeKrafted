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
  { label: "About", href: "/" },
];

export const announcementItems: AnnouncementItem[] = [
  { text: "✦ Made with love in real homes", emphasis: true },
  { text: "Free shipping over ₹999" },
  { text: "Freshly prepared · No preservatives" },
];

export const brandBlurb =
  "Handmade gifts and homemade goodness from real home kitchens, thoughtfully packed for every occasion.";

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
