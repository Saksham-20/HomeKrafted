import type { Category } from "@/lib/types";

/**
 * The 8 "shop by category" tiles from the prototype home page.
 * `productCount` reflects the full implied catalog (the Shop listing
 * copy reads "64 small-batch products…") — not just the 8 seed products
 * below, which mostly slot into these categories anyway.
 */
export const categories: Category[] = [
  {
    id: "ct1",
    slug: "pickles",
    name: "Pickles",
    imagePlaceholder: "PICKLES",
    imageSrc: "/images/categories/pickles.jpg",
    productCount: 12,
  },
  {
    id: "ct2",
    slug: "chutneys",
    name: "Chutneys",
    imagePlaceholder: "CHUTNEYS",
    imageSrc: "/images/categories/chutneys.jpg",
    productCount: 8,
  },
  {
    id: "ct3",
    slug: "cookies",
    name: "Cookies",
    imagePlaceholder: "COOKIES",
    imageSrc: "/images/categories/cookies.jpg",
    productCount: 10,
  },
  {
    id: "ct4",
    slug: "bakery",
    name: "Bakery",
    imagePlaceholder: "BAKERY",
    imageSrc: "/images/categories/bakery.jpg",
    productCount: 7,
  },
  {
    id: "ct5",
    slug: "dry-fruits",
    name: "Dry Fruits",
    imagePlaceholder: "DRY FRUITS",
    imageSrc: "/images/categories/dry-fruits.jpg",
    productCount: 6,
  },
  {
    id: "ct6",
    slug: "chocolates",
    name: "Chocolates",
    imagePlaceholder: "CHOCOLATES",
    imageSrc: "/images/categories/chocolates.jpg",
    productCount: 5,
  },
  {
    id: "ct7",
    slug: "snacks",
    name: "Snacks",
    imagePlaceholder: "SNACKS",
    imageSrc: "/images/categories/snacks.jpg",
    productCount: 9,
  },
  {
    id: "ct8",
    slug: "hampers",
    name: "Hampers",
    imagePlaceholder: "HAMPERS",
    imageSrc: "/images/categories/hampers.jpg",
    productCount: 7,
  },
  {
    id: "ct13",
    slug: "sweets-ladoos",
    name: "Sweets & Ladoos",
    imagePlaceholder: "SWEETS & LADOOS",
    imageSrc: "/images/categories/sweets-ladoos.jpg",
    productCount: 2,
    group: "food",
  },
  /*
   * The craft half (M33). These four are real rows in production —
   * `server/prisma/seed-crafts.ts` has seeded them since M22 — but they
   * had never been mirrored here, so mock mode showed a food-only
   * marketplace and nobody working offline saw half the catalogue.
   *
   * Their tiles are licensed stock photography since M56 (crops of the
   * matching product photos — see `docs/IMAGE-LICENSES.md`), seeded onto
   * production by `server/prisma/seed-catalogue.ts`. `sortOrder`
   * continues from the seed's numbering so both modes order the row
   * identically.
   */
  {
    id: "ct9",
    slug: "candles-home",
    name: "Candles & Home",
    imagePlaceholder: "CANDLES & HOME",
    imageSrc: "/images/categories/candles-home.jpg",
    productCount: 6,
    group: "craft",
    sortOrder: 10,
  },
  {
    id: "ct10",
    slug: "handmade-jewellery",
    name: "Handmade Jewellery",
    imagePlaceholder: "JEWELLERY",
    imageSrc: "/images/categories/handmade-jewellery.jpg",
    productCount: 2,
    group: "craft",
    sortOrder: 11,
  },
  {
    id: "ct11",
    slug: "art-prints",
    name: "Art & Prints",
    imagePlaceholder: "ART & PRINTS",
    imageSrc: "/images/categories/art-prints.jpg",
    productCount: 2,
    group: "craft",
    sortOrder: 12,
  },
  {
    id: "ct12",
    slug: "personalised-gifts",
    name: "Personalised Gifts",
    imagePlaceholder: "PERSONALISED",
    imageSrc: "/images/categories/personalised-gifts.jpg",
    productCount: 2,
    group: "craft",
    sortOrder: 13,
  },
];

export function getCategoryBySlug(slug: string): Category | undefined {
  return categories.find((c) => c.slug === slug);
}

export function getCategoryById(id: string): Category | undefined {
  return categories.find((c) => c.id === id);
}
