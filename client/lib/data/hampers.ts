import type { HamperBox } from "@/lib/types";

/** The 3 box-size tiers from the hamper builder's "1 · Choose your box" step. */
export const hamperBoxes: HamperBox[] = [
  { id: "hb1", name: "Petite", maxItems: 3, price: 399, itemsLabel: "Up to 3 items" },
  { id: "hb2", name: "Signature", maxItems: 5, price: 699, itemsLabel: "Up to 5 items" },
  { id: "hb3", name: "Grand", maxItems: 8, price: 1199, itemsLabel: "Up to 8 items" },
];

export function getHamperBoxById(id: string): HamperBox | undefined {
  return hamperBoxes.find((b) => b.id === id);
}
