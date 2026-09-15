import { buildShelfPicks } from "./shelf-picks";
import type { Category } from "@/lib/types";

const cat = (id: string, name: string, group: "food" | "craft", parentId?: string) =>
  ({ id, name, slug: id, group, parentId }) as unknown as Category;

// Shaped on production's craft tree, 2026-09-15.
const CATEGORIES: Category[] = [
  cat("art", "Art & Prints", "craft"),
  cat("crochet", "Crochet", "craft"),
  cat("flowers", "Flowers", "craft"),
  cat("candles", "Candles & Home", "craft"),
  cat("recipient", "Shop by recipient", "craft"),
  cat("paintings", "Paintings", "craft", "art"),
  cat("scented", "Scented Candles", "craft", "candles"),
  cat("forher", "For Her", "craft", "recipient"),
  cat("forkids", "For Kids", "craft", "recipient"),
  cat("pickles", "Pickles", "food"),
];

describe("buildShelfPicks", () => {
  it("offers childless top-level shelves — the ones the six-chip version hid", () => {
    const { groups } = buildShelfPicks(CATEGORIES, "craft", "");
    const all = groups.flatMap((g) => g.shelves.map((s) => s.name));
    expect(all).toEqual(expect.arrayContaining(["Crochet", "Flowers", "Paintings", "Scented Candles"]));
  });

  it("uses a parent as a heading, never as a chip", () => {
    const { groups } = buildShelfPicks(CATEGORIES, "craft", "");
    const all = groups.flatMap((g) => g.shelves.map((s) => s.name));
    expect(all).not.toContain("Art & Prints");
    expect(groups.map((g) => g.heading)).toEqual([null, "Art & Prints", "Candles & Home", "Shop by recipient"]);
  });

  it("puts the 'Shop by' groupings last", () => {
    const { groups } = buildShelfPicks(CATEGORIES, "craft", "");
    expect(groups[groups.length - 1].heading).toBe("Shop by recipient");
  });

  it("stays on the chosen side", () => {
    const { groups } = buildShelfPicks(CATEGORIES, "craft", "");
    expect(groups.flatMap((g) => g.shelves).map((s) => s.name)).not.toContain("Pickles");
  });

  it("suggests a shelf named in the product", () => {
    expect(buildShelfPicks(CATEGORIES, "craft", "Crochet Porcupine soft toy").suggested.map((c) => c.name)).toEqual([
      "Crochet",
    ]);
    expect(buildShelfPicks(CATEGORIES, "craft", "Lavender candle").suggested.map((c) => c.name)).toEqual([
      "Scented Candles",
    ]);
  });

  it("suggests nothing for an empty name, and ignores generic words", () => {
    expect(buildShelfPicks(CATEGORIES, "craft", "").suggested).toEqual([]);
    expect(buildShelfPicks(CATEGORIES, "craft", "Handmade gift for her").suggested.map((c) => c.name)).toEqual([
      "For Her",
    ]);
  });
});
