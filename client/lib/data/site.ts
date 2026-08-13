/**
 * Site-chrome content: header nav, footer columns and the home page's
 * promo bands. Not part of the Prisma-bound domain model
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

/**
 * Header primary nav — the **catalogue** destinations, and only those.
 * Collapses into <MobileDrawer> under ~1190px.
 *
 * M20 renames rather than re-routes. "Shop" became **Homemade Food**
 * because the site now sells two different things and "Shop" no longer
 * says which; `/shop` itself is unchanged, so every existing link, every
 * indexed URL and every `sitemap.ts` entry still resolves. Renaming the
 * route as well would have cost the SEO for nothing a visitor notices.
 *
 * "Snacks" is gone from the top level — it is a *category* of homemade
 * food in the client's structure, not a peer of it. `/snacks` still
 * exists and is still linked from the footer, the drawer and the home
 * page, because it is a genuinely different ordering flow (WhatsApp, no
 * cart).
 *
 * **M34 cut this row from six items to three, and the three that left
 * went to `secondaryNav` — not to the footer.** Six links plus a search
 * field plus a wallet chip plus three icons is nine targets competing in
 * a row that has 1092px, and the thing that lost was the search field:
 * it rendered as a ~32px stub that read "Sear…" (measured on production,
 * 2026-08-13). Marketplaces this shape — Zomato, Swiggy — keep two or
 * three destinations up here and let the landing page carry the rest,
 * where a tile can say what a thing *is* instead of naming it in 90px.
 *
 * The rule for adding an item back: **is it a catalogue you browse?** If
 * it is a flow, an occasion hub or an enquiry, it belongs in
 * `secondaryNav`, which is more visible on the home page than a seventh
 * nav link would be. And re-measure against 1092px — see
 * `Header.module.css` and `e2e/tests/header-capacity.spec.ts`.
 */
export const primaryNav: NavLink[] = [
  { label: "Homemade Food", href: "/shop" },
  { label: "Handcrafted Gifts", href: "/gifts" },
  { label: "Gift Hampers", href: "/hamper" },
];

/**
 * The four ways *in* that are not a catalogue — rendered as the home
 * page's quick-entry strip directly under the hero (`QuickEntryRow`),
 * and as the drawer's second nav group.
 *
 * **This is a promotion, not a demotion.** Each of these was argued into
 * the desktop nav on the grounds that the footer was too buried to reach
 * it, and every one of those arguments still holds:
 *
 * - **Corporate & bulk** (M19 WS3a) — one order is ₹5k–₹50k against ₹120
 *   for a thali. A buyer sourcing fifty Diwali hampers is not scrolling
 *   to the bottom to find out whether we do that.
 * - **Meal plans** (M21) — the one product on the site that *recurs*: a
 *   cycle is ₹960–₹3,900 and renews.
 * - **Occasions** — the gifting hub, and the seasonal countdown's home.
 * - **Snacks on WhatsApp** — a different ordering flow entirely, and
 *   until M34 it was in *neither* nav, only the footer and the drawer.
 *
 * A 90px nav link is a worse answer to "reach it sooner" than a tile in
 * the first screenful that names the thing and says who it is for. If a
 * fifth entry is ever added, the strip wraps to two rows on desktop —
 * check that before adding one.
 */
export const secondaryNav: NavLink[] = [
  { label: "Occasions", href: "/collections" },
  { label: "Meal plans", href: "/meal-plans" },
  { label: "Corporate & bulk", href: "/corporate" },
  { label: "Snacks on WhatsApp", href: "/snacks" },
];

/**
 * Copy for the home page's quick-entry strip. Keyed by `secondaryNav`
 * href so the two cannot drift into different destinations, and kept
 * apart from `secondaryNav` itself because the drawer wants the bare
 * label while the strip wants a sentence saying who it is for.
 */
export const quickEntryDetail: Record<string, { title: string; blurb: string }> = {
  // Two lines at the tile's desktop width — a third line turns the strip
  // into four paragraphs and it stops being something you scan.
  "/collections": {
    title: "Shop by occasion",
    blurb: "Diwali, weddings and thank-yous.",
  },
  "/meal-plans": {
    title: "Daily meal plans",
    blurb: "Lunch from one kitchen, every day.",
  },
  "/corporate": {
    title: "Corporate & bulk",
    blurb: "Fifty hampers, quoted by a person.",
  },
  "/snacks": {
    title: "Snacks on WhatsApp",
    blurb: "Today's menu, ordered in a message.",
  },
};

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
 * "Backed by" — the institutional strip, on `/about` since M28.
 *
 * It used to close the home page, directly beneath "Meet the Hands Behind
 * the Flavours", which put three incubator marks in the last position a
 * visitor read after the makers themselves. Borrowed credibility should
 * not be the closing argument on a page whose subject is the people
 * cooking; it belongs where somebody has actually asked who is behind
 * this. Rendered by `components/about/AboutClient.tsx`.
 *
 * **These are claims about real organisations, and they now carry the
 * organisations' marks.** Until M24 this was plain text on the reasoning that
 * reproducing a mark is a separate permission from stating a relationship. The
 * owner supplied the three files and chose to ship them (2026-08-08), which
 * settles the second permission and not the first.
 *
 * So the original warning stands, and is *stronger* than it was: an affiliation
 * asserted with the other party's logo attached is a bigger claim to have to
 * withdraw than one asserted in small grey text. Confirm each relationship in
 * writing. Tracked as a launch gate in `docs/LAUNCH-READINESS.md`.
 *
 * Two rules for anyone editing this:
 * - **Never alter a mark** — no recolouring, no grayscale filter, no cropping.
 *   Altering someone's logo is yet another permission. Optical differences are
 *   handled in CSS by giving each mark its own display height.
 * - **The `detail` sentence stays under the mark.** The logo identifies the
 *   organisation; the sentence states what the relationship actually is.
 *   Dropping it turns a stated affiliation into an implied endorsement.
 */
export interface BackerClaim {
  /**
   * Stable key. Also selects the per-mark optical-size class in
   * `components/about/AboutClient.module.css` — the strip moved off Home
   * to `/about` in M28, so that is where the width variables live now.
   */
  id: "cuna" | "isbAic" | "cgc";
  label: string;
  detail: string;
  /**
   * Bundled mark under `public/images/backers/`. Optional: a backer with no
   * file renders as its `detail` sentence alone, which is what the whole
   * strip was before M24.
   */
  logoSrc?: string;
  /**
   * The supplied file's own aspect ratio. Marks are normalised on **height**,
   * never width — CGC's is a dense circular seal and ISB's a wide horizontal
   * lockup, so equal widths would make one illegible and the other enormous.
   */
  logoRatio?: string;
  /**
   * `sizes` for the real rendered width. `ImageSlot`'s default assumes a card
   * in a grid and would pull a viewport-wide image to fill ~44 pixels.
   */
  logoSizes?: string;
  /**
   * Alt text: the organisation's full name. `ImageSlot` falls back to `label`,
   * and `label` is a short display string — never let a filename reach a
   * screen reader.
   */
  logoAlt?: string;
}

export const backedBy: BackerClaim[] = [
  {
    id: "cuna",
    label: "CUNA",
    detail: "Social initiative supported by CUNA",
    logoSrc: "/images/backers/cuna.jpg",
    logoRatio: "1/1",
    logoSizes: "44px",
    logoAlt: "Chandigarh United Nations Association",
  },
  {
    id: "isbAic",
    label: "ISB AIC",
    detail: "Incubated at ISB Atal Incubation Centre",
    logoSrc: "/images/backers/isb-aic.jpg",
    logoRatio: "4/1",
    logoSizes: "176px",
    logoAlt: "Indian School of Business — Atal Incubation Centre",
  },
  {
    // M24: was `label: "CGC"` / `detail: "Supported by CGC"`. The supplied
    // mark reads "CGC-J Technology Business Incubator Association ·
    // VentureNest", which is a different organisation name from the one the
    // site was printing. The *verb* is deliberately unchanged — correcting
    // whose name it is must not quietly upgrade "supported by" into
    // "incubated at", which is a stronger claim nobody has confirmed.
    id: "cgc",
    label: "CGC VentureNest",
    detail: "Supported by CGC-J Technology Business Incubator Association (VentureNest)",
    logoSrc: "/images/backers/cgc-venturenest.jpg",
    logoRatio: "4/3",
    logoSizes: "72px",
    logoAlt: "CGC-J Technology Business Incubator Association — VentureNest",
  },
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
