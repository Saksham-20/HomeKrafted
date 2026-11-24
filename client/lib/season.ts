/**
 * The season (2026-11-24, the client's "Winter Edit" mockup): the home
 * page's words, pictures and doors, and the switch for the site-wide
 * seasonal dress (paper header, snowfall, winter footer). One
 * file so the next season — or none — is an edit here, not a hunt through
 * the chrome.
 *
 * Every picture is one the site already shows: Pexels stock logged in
 * `docs/IMAGE-LICENSES.md`, or the owner's own catalogue photographs from
 * the first build (the batch the log calls "an existing owner asset").
 * The mockup's images were generated, and CLAUDE.md never ships generated
 * food or product imagery — so no picture here is new. Every `href`
 * is a page that exists; a category door names its slug separately so
 * the page can fall back when that shelf is not in the live catalogue.
 *
 * Plain data: `client/lib` is shared with the native app (no React).
 */

export interface SeasonDoor {
  label: string;
  /** Where it goes when `category` is absent or unknown to the catalogue. */
  href: string;
  /** A food shelf this door narrows `/shop` to, when the shelf exists. */
  category?: string;
  image: string;
  /** CSS `object-position` for the crop, when the subject is off-centre. */
  focus?: string;
}

export interface SeasonPromo {
  eyebrow: string;
  title: string;
  body: string;
  cta: { label: string; href: string };
  image: string;
}

export interface SeasonRecipient {
  label: string;
  /** A `recipient` attribute value — `/gifts?recipient=…` filters on it. */
  value: string;
  /** A lucide icon name, resolved in the component. */
  icon: "gift" | "shirt" | "blocks" | "heart" | "briefcase" | "house";
}

export const SEASON = {
  name: "The Winter Edit",
  /**
   * The site-wide dress. `null` takes it off everywhere at once: the
   * paper header, the snow in the hero and footer, the footer's snow cap. The
   * home page's own content stays until it is rewritten for the next
   * season.
   */
  theme: "winter" as "winter" | null,
  /** The header's seasonal tab. */
  nav: { label: "Winter Edit", href: "/#winter-edit" },
  /** The anchor the hero and the header tab point at. */
  anchor: "winter-edit",

  hero: {
    title: "Winter tastes better when it’s made at home.",
    body: "From comforting home-cooked meals to thoughtful handmade gifts — the little things that make winter special, from real homes near you.",
    primary: { label: "Explore the Winter Edit", href: "#winter-edit" },
    secondary: { label: "Shop gifts", href: "/gifts" },
    // A 3:2 cut of the same licensed photograph as `hero-food.jpg`; the
    // 3:1 banner strip read as squashed at the hero's height.
    image: "/images/site/hero-winter-table.jpg",
  },

  mood: {
    title: "What are you in the mood for?",
    subtitle: "A little something for every winter craving.",
    doors: [
      { label: "Comfort meals", href: "/meal-plans", image: "/images/site/hero-food.jpg", focus: "22% 50%" },
      { label: "Winter sweets", href: "/shop", category: "sweets-ladoos", image: "/images/products/motichoor-ladoo.jpg" },
      { label: "Fresh bakes", href: "/shop", category: "bakery", image: "/images/categories/cookies.jpg" },
      { label: "Chai-time snacks", href: "/snacks", image: "/images/categories/snacks.jpg" },
      { label: "Gift hampers", href: "/hamper", image: "/images/categories/hampers.jpg" },
      { label: "Handmade gifts", href: "/gifts", image: "/images/products/crochet-amigurumi-soft-toy.jpg" },
    ] satisfies SeasonDoor[],
  },

  edit: {
    kicker: "The Winter Edit",
    title: "Made for colder days. Made with more love.",
    more: { label: "Explore collections", href: "/collections" },
    doors: [
      { label: "The comfort collection", href: "/shop", image: "/images/products/masala-chai-blend.jpg" },
      { label: "Something sweet", href: "/shop", category: "sweets-ladoos", image: "/images/categories/dry-fruits.jpg" },
      { label: "Winter gifting", href: "/hamper", image: "/images/site/hero-gifts.jpg", focus: "40% 50%" },
      { label: "Made by hand", href: "/gifts", image: "/images/products/embroidered-hoop-art.jpg" },
    ] satisfies SeasonDoor[],
  },

  bestsellers: {
    title: "Bestsellers this week",
    more: { label: "View all", href: "/gifts" },
  },

  promos: [
    {
      eyebrow: "Homemade food near you",
      title: "Not from a restaurant. From someone’s home.",
      body: "Real kitchens. Real recipes. Food made with love.",
      cta: { label: "Explore home kitchens", href: "/shop" },
      image: "/images/categories/pickles.jpg",
    },
    {
      eyebrow: "The gifting edit",
      title: "Some gifts feel like a warm hug.",
      body: "Thoughtfully picked, beautifully packed.",
      cta: { label: "Explore gifts", href: "/gifts" },
      image: "/images/products/festive-assorted-hamper.jpg",
    },
  ] satisfies SeasonPromo[],

  recipients: {
    title: "Shop gifts by recipient",
    list: [
      { label: "For her", value: "her", icon: "gift" },
      { label: "For him", value: "him", icon: "shirt" },
      { label: "For kids", value: "kids", icon: "blocks" },
      { label: "For couples", value: "couple", icon: "heart" },
      { label: "For colleagues", value: "colleague", icon: "briefcase" },
      { label: "For the home", value: "host", icon: "house" },
    ] satisfies SeasonRecipient[],
  },

  mealPlans: {
    title: "A taste of home, wherever life takes you.",
    cta: { label: "Explore meal plans", href: "/meal-plans" },
  },
} as const;

/**
 * A door's link: its shelf on `/shop` when the live catalogue has that
 * shelf, otherwise its fallback page. Production's categories are not the
 * seed's, so a hardcoded `?category=` could land on an empty filter.
 */
export function seasonDoorHref(door: SeasonDoor, liveCategorySlugs: ReadonlySet<string>): string {
  if (door.category && liveCategorySlugs.has(door.category)) {
    return `${door.href}?category=${encodeURIComponent(door.category)}`;
  }
  return door.href;
}
