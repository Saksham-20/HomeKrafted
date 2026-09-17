import type { Collection } from "@/lib/types";

/** Curated gift guides — `/guides/[slug]`, and the hand-picked ordering behind `/collections/[occasion]` where one is attached. */
export const collections: Collection[] = [
  {
    id: "cl1",
    slug: "diwali-gifting-edit",
    title: "Diwali Gifting Edit",
    description:
      "Festive favourites — dry-fruit laddoos, curated hampers and spiced chai — ready to gift.",
    occasionId: "oc3",
    productIds: ["pr6", "pr8", "pr7"],
    imageSrc: "/images/products/dry-fruit-laddoo-box.jpg",
    featured: true,
    sortOrder: 1,
  },
  {
    id: "cl2",
    slug: "corporate-gifting-picks",
    title: "Corporate Gifting Picks",
    description:
      "Bulk-friendly, shelf-stable picks that travel well for client and team gifting.",
    occasionId: "oc5",
    productIds: ["pr8", "pr6", "pr5", "pr4"],
    imageSrc: "/images/products/festive-assorted-hamper.jpg",
    sortOrder: 2,
  },
  {
    // Not tied to an occasion — since M16 a guide is its own page
    // (`/guides/[slug]`), not only the curated ordering behind an
    // occasion, so one that stands alone has somewhere to live.
    id: "cl3",
    slug: "first-time-gifting",
    title: "If you have never ordered home-made before",
    description:
      "Eight things that travel well, keep for weeks and are hard to get wrong — a decent place to start if you are not sure what a home kitchen can do.",
    productIds: ["pr1", "pr3", "pr7", "pr5"],
    imageSrc: "/images/products/mango-thokku-pickle.jpg",
    featured: true,
    sortOrder: 0,
  },
  /*
   * The four fixed-slug rails `app/page.tsx#resolveCollection` reads for
   * the home page's Bestsellers/Trending toggle (see that file's own
   * comment). Missing from mock data before 2026-09-17, so both rails
   * fell through to the identical "top-rated of this kind" fallback and
   * rendered the same six products in the same order — the duplicate-key
   * console errors and the visibly repeated rail were this gap, not a
   * bug in `resolveCollection` itself. Four distinct sets, same shape a
   * real admin curation would take on `/admin/collections/curations`.
   */
  {
    id: "cl4",
    slug: "bestsellers-food",
    title: "Bestsellers — Homemade Food",
    description: "The dishes ordered again and again, across every kitchen.",
    productIds: ["pr3", "pr6", "pr1", "pr8"],
    sortOrder: 4,
  },
  {
    id: "cl5",
    slug: "bestsellers-craft",
    title: "Bestsellers — Handcrafted Gifts",
    description: "The makers' own top sellers, picked by repeat buyers.",
    productIds: ["pr19", "pr20", "pr23", "pr30"],
    sortOrder: 5,
  },
  {
    id: "cl6",
    slug: "trending-food",
    title: "Trending Now — Homemade Food",
    description: "Rising fast this week, across the tricity kitchens.",
    productIds: ["pr9", "pr10", "pr14", "pr17"],
    sortOrder: 6,
  },
  {
    id: "cl7",
    slug: "trending-craft",
    title: "Trending Now — Handcrafted Gifts",
    description: "The gifts more buyers are opening a listing page for this week.",
    productIds: ["pr21", "pr22", "pr26", "pr28"],
    sortOrder: 7,
  },
];

export function getCollectionBySlug(slug: string): Collection | undefined {
  return collections.find((c) => c.slug === slug);
}

/** Curated collection for an occasion, if one's been assembled (only some occasions have one yet). */
export function getCollectionByOccasionId(occasionId: string): Collection | undefined {
  return collections.find((c) => c.occasionId === occasionId);
}
