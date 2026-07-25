import type { Collection } from "@/lib/types";

/** Curated occasion-based collections (`/collections/[occasion]`). */
export const collections: Collection[] = [
  {
    id: "cl1",
    slug: "diwali-gifting-edit",
    title: "Diwali Gifting Edit",
    description:
      "Festive favourites — dry-fruit laddoos, curated hampers and spiced chai — ready to gift.",
    occasionId: "oc3",
    productIds: ["pr6", "pr8", "pr7"],
  },
  {
    id: "cl2",
    slug: "corporate-gifting-picks",
    title: "Corporate Gifting Picks",
    description:
      "Bulk-friendly, shelf-stable picks that travel well for client and team gifting.",
    occasionId: "oc5",
    productIds: ["pr8", "pr6", "pr5", "pr4"],
  },
];

export function getCollectionBySlug(slug: string): Collection | undefined {
  return collections.find((c) => c.slug === slug);
}

/** Curated collection for an occasion, if one's been assembled (only some occasions have one yet). */
export function getCollectionByOccasionId(occasionId: string): Collection | undefined {
  return collections.find((c) => c.occasionId === occasionId);
}
