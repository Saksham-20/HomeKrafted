import type { Occasion } from "@/lib/types";

/** The 8 "shop by occasion" tiles from the prototype home page. */
export const occasions: Occasion[] = [
  { id: "oc1", slug: "birthday", name: "Birthday", initial: "B" },
  { id: "oc2", slug: "anniversary", name: "Anniversary", initial: "A" },
  { id: "oc3", slug: "diwali", name: "Diwali", initial: "D" },
  { id: "oc4", slug: "housewarming", name: "Housewarming", initial: "H" },
  { id: "oc5", slug: "corporate", name: "Corporate", initial: "C" },
  { id: "oc6", slug: "baby-shower", name: "Baby Shower", initial: "B" },
  { id: "oc7", slug: "wedding", name: "Wedding", initial: "W" },
  { id: "oc8", slug: "thank-you", name: "Thank You", initial: "T" },
];

export function getOccasionBySlug(slug: string): Occasion | undefined {
  return occasions.find((o) => o.slug === slug);
}
