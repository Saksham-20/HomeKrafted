import { compareTopRated, uncuratedRail } from "./home-rails";
import type { Product } from "@/lib/types";

/**
 * The home page's uncurated shelves. Expected orders are worked by hand
 * from the rule: featured (admin's rank, unranked last), then rating, then
 * review count; and the reviewed-only pool a featured listing is exempt
 * from.
 */

const item = (id: string, over: Partial<Product> = {}): Product =>
  ({ id, rating: 0, reviewCount: 0, ...over }) as unknown as Product;
const ids = (list: Product[]) => list.map((p) => p.id);

describe("compareTopRated", () => {
  it("featured beats a better rating; rating then review count break the rest", () => {
    expect(compareTopRated(item("f", { featured: true, featuredRank: 1 }), item("g", { rating: 5, reviewCount: 99 }))).toBeLessThan(0);
    expect(compareTopRated(item("a", { rating: 4.5 }), item("b", { rating: 4.0 }))).toBeLessThan(0);
    expect(compareTopRated(item("a", { rating: 4, reviewCount: 9 }), item("b", { rating: 4, reviewCount: 3 }))).toBeLessThan(0);
  });
});

describe("uncuratedRail", () => {
  it("leads with featured listings in the admin's order, then the top-rated", () => {
    const rail = uncuratedRail(
      [
        item("loved", { rating: 4.9, reviewCount: 30 }),
        item("rank2", { featured: true, featuredRank: 2, rating: 3, reviewCount: 1 }),
        item("ok", { rating: 4.0, reviewCount: 5 }),
        item("rank1", { featured: true, featuredRank: 1, rating: 4, reviewCount: 2 }),
      ],
      12,
    );
    expect(ids(rail)).toEqual(["rank1", "rank2", "loved", "ok"]);
  });

  it("keeps a featured listing nobody has reviewed yet — featuring a new listing must show", () => {
    const rail = uncuratedRail(
      [item("loved", { rating: 4.9, reviewCount: 30 }), item("new-featured", { featured: true, featuredRank: 1 })],
      12,
    );
    expect(ids(rail)).toEqual(["new-featured", "loved"]);
  });

  it("still leaves out an unreviewed listing that is not featured, once anything has a review", () => {
    // The reviewed-only pool is what stops a rail led by a tie of zeros.
    const rail = uncuratedRail([item("loved", { rating: 4.9, reviewCount: 3 }), item("unreviewed")], 12);
    expect(ids(rail)).toEqual(["loved"]);
  });

  it("uses the whole catalogue when nothing anywhere has a review", () => {
    const rail = uncuratedRail([item("a"), item("b", { featured: true }), item("c")], 12);
    // b is featured (unranked); a and c tie on everything and keep their order.
    expect(ids(rail)).toEqual(["b", "a", "c"]);
  });

  it("caps at the limit after ordering, so a featured listing is never the one cut", () => {
    const rail = uncuratedRail(
      [
        item("r1", { rating: 5, reviewCount: 9 }),
        item("r2", { rating: 4.8, reviewCount: 9 }),
        item("late-featured", { featured: true, featuredRank: 7 }),
      ],
      2,
    );
    expect(ids(rail)).toEqual(["late-featured", "r1"]);
  });

  it("does not sort the list it was handed", () => {
    const list = [item("plain", { rating: 3, reviewCount: 1 }), item("f", { featured: true, featuredRank: 1 })];
    uncuratedRail(list, 12);
    expect(ids(list)).toEqual(["plain", "f"]);
  });

  it("returns nothing for an empty catalogue", () => {
    expect(uncuratedRail([], 12)).toEqual([]);
  });
});
