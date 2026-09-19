import { compareRecommended, isSoldOut, sortGifts, spreadByMaker } from "./gift-sort";
import type { Product } from "@/lib/types";

const gift = (id: string, over: Partial<Product> = {}, price = 100, stock = 5): Product => ({
  id,
  slug: id,
  vendorId: "vd1",
  name: id,
  categoryId: "ct1",
  occasionIds: [],
  dietary: [],
  images: [],
  weightOptions: [{ sku: `${id}-one`, label: "One", price, mrp: price, stock }],
  defaultWeightSku: `${id}-one`,
  rating: 0,
  reviewCount: 0,
  tags: [],
  isPackaged: true,
  cashbackPct: 0,
  description: "x",
  kind: "craft",
  ...over,
});

const priceOf = (p: Product) => p.weightOptions[0].price;
const none = new Set<string>();
const ids = (list: Product[]) => list.map((p) => p.id);

describe("isSoldOut", () => {
  it("is true only when no size can be added to a basket", () => {
    expect(isSoldOut(gift("a", {}, 100, 0))).toBe(true);
    expect(isSoldOut(gift("a", {}, 100, 3))).toBe(false);
  });

  it("is false when the default size is out but another size is in stock", () => {
    const p = gift("a");
    p.weightOptions = [
      { sku: "a-one", label: "Small", price: 100, mrp: 100, stock: 0 },
      { sku: "a-two", label: "Large", price: 150, mrp: 150, stock: 2 },
    ];
    expect(isSoldOut(p)).toBe(false);
  });
});

describe("sortGifts", () => {
  it("puts sold-out gifts last in every sort — the Rakhi hampers that led the grid", () => {
    const list = [gift("rakhi-cheap", {}, 50, 0), gift("candle", {}, 300), gift("earrings", {}, 180)];
    for (const sort of ["most-loved", "price-asc", "price-desc", "nearest"] as const) {
      expect(ids(sortGifts(list, sort, { soonOccasionIds: none, priceOf })).at(-1)).toBe("rakhi-cheap");
    }
  });

  it("orders by price inside the in-stock half, then inside the sold-out half", () => {
    const list = [gift("c", {}, 300), gift("x", {}, 20, 0), gift("a", {}, 100), gift("y", {}, 10, 0)];
    expect(ids(sortGifts(list, "price-asc", { soonOccasionIds: none, priceOf }))).toEqual(["a", "c", "y", "x"]);
  });

  it("recommended leads with gifts for an occasion coming up", () => {
    const list = [gift("birthday", { occasionIds: ["bday"] }), gift("diwali", { occasionIds: ["diwali"] })];
    const soon = new Set(["diwali"]);
    expect(ids(sortGifts(list, "most-loved", { soonOccasionIds: soon, priceOf }))).toEqual(["diwali", "birthday"]);
  });

  it("puts the newest first when nothing else tells gifts apart (no reviews, no occasion)", () => {
    const list = [
      gift("oldest", { submittedAt: "2026-08-01T10:00:00Z" }),
      gift("newest", { submittedAt: "2026-09-10T10:00:00Z" }),
      gift("middle", { submittedAt: "2026-08-20T10:00:00Z" }),
    ];
    expect(ids(sortGifts(list, "most-loved", { soonOccasionIds: none, priceOf }))).toEqual(["newest", "middle", "oldest"]);
  });

  it("keeps the API's order when even the dates are missing", () => {
    const list = [gift("first"), gift("second"), gift("third")];
    expect(ids(sortGifts(list, "most-loved", { soonOccasionIds: none, priceOf }))).toEqual(["first", "second", "third"]);
  });

  it("does not mutate the list it was given", () => {
    const list = [gift("b", {}, 200), gift("a", {}, 100)];
    sortGifts(list, "price-asc", { soonOccasionIds: none, priceOf });
    expect(ids(list)).toEqual(["b", "a"]);
  });
});

describe("compareRecommended", () => {
  it("ranks reviewed gifts by rating once the occasion question is a tie", () => {
    const good = gift("good", { rating: 4.8, reviewCount: 3 });
    const fine = gift("fine", { rating: 4.1, reviewCount: 9 });
    expect(compareRecommended(good, fine, none)).toBeLessThan(0);
  });

  it("puts an admin-featured gift ahead of a better-rated one that is not", () => {
    const featured = gift("featured", { featured: true, featuredRank: 1, rating: 0 });
    const loved = gift("loved", { rating: 5, reviewCount: 40 });
    expect(compareRecommended(featured, loved, none)).toBeLessThan(0);
    expect(compareRecommended(loved, featured, none)).toBeGreaterThan(0);
  });

  it("puts featured ahead of a gift for an occasion coming up", () => {
    // An admin choosing a listing is deliberate; "soon" is the page's own
    // inference, so it does not get to outrank the choice.
    const featured = gift("featured", { featured: true, featuredRank: 2 });
    const diwali = gift("diwali", { occasionIds: ["diwali"] });
    expect(compareRecommended(featured, diwali, new Set(["diwali"]))).toBeLessThan(0);
  });
});

describe("sortGifts — featured first under the default sort", () => {
  const ctx = { soonOccasionIds: none, priceOf };

  it("leads with featured gifts in the admin's rank order, then everything else ranked as before", () => {
    const list = [
      gift("plain-best", { rating: 4.9, reviewCount: 30 }),
      gift("rank2", { featured: true, featuredRank: 2 }),
      gift("plain-ok", { rating: 4.0, reviewCount: 3 }),
      gift("rank1", { featured: true, featuredRank: 1 }),
    ];
    // Featured by rank (1, 2), then plain by rating (4.9, 4.0).
    expect(ids(sortGifts(list, "most-loved", ctx))).toEqual(["rank1", "rank2", "plain-best", "plain-ok"]);
  });

  it("sorts an unranked featured gift after every ranked one, and orders unranked ones by the usual keys", () => {
    const list = [
      gift("unranked-low", { featured: true, featuredRank: null, rating: 3, reviewCount: 2 }),
      gift("unranked-high", { featured: true, rating: 4.6, reviewCount: 8 }),
      gift("ranked-last", { featured: true, featuredRank: 40, rating: 0 }),
    ];
    // Rank 40 still beats "no rank"; the two unranked tie on rank and fall
    // to rating (4.6, then 3).
    expect(ids(sortGifts(list, "most-loved", ctx))).toEqual(["ranked-last", "unranked-high", "unranked-low"]);
  });

  it("pins featured gifts BEFORE the maker spread instead of dealing them out with it", () => {
    // Three featured gifts from one storefront, ranked 1-3, and ordinary
    // gifts from two storefronts. If the featured ones went through the
    // round-robin they would come out one per maker among the rest
    // (f1, o2, f2, f3, ...) and the admin's running order would be
    // scattered. Pinned first, the order is exactly the admin's.
    const list = [
      gift("f3", { vendorId: "A", featured: true, featuredRank: 3 }),
      gift("o3", { vendorId: "A", rating: 4.0, reviewCount: 4 }),
      gift("f1", { vendorId: "A", featured: true, featuredRank: 1 }),
      gift("o2", { vendorId: "B", rating: 4.5, reviewCount: 4 }),
      gift("f2", { vendorId: "A", featured: true, featuredRank: 2 }),
      gift("o1", { vendorId: "A", rating: 4.9, reviewCount: 4 }),
    ];
    // Featured: f1, f2, f3. Rest by rating: o1(A 4.9), o2(B 4.5), o3(A 4.0);
    // round-robin over makers A:[o1, o3], B:[o2] gives o1, o2, o3.
    expect(ids(sortGifts(list, "most-loved", ctx))).toEqual(["f1", "f2", "f3", "o1", "o2", "o3"]);
  });

  it("still spreads the makers among the ordinary gifts", () => {
    const list = [
      gift("f1", { vendorId: "A", featured: true, featuredRank: 1 }),
      gift("a1", { vendorId: "A", rating: 4.9, reviewCount: 9 }),
      gift("a2", { vendorId: "A", rating: 4.8, reviewCount: 9 }),
      gift("b1", { vendorId: "B", rating: 4.1, reviewCount: 9 }),
    ];
    // Rest by rating: a1, a2, b1 -> round-robin A:[a1, a2], B:[b1] = a1, b1, a2.
    expect(ids(sortGifts(list, "most-loved", ctx))).toEqual(["f1", "a1", "b1", "a2"]);
  });

  it("keeps a sold-out featured gift last — sold out always goes last", () => {
    const list = [
      gift("featured-sold-out", { featured: true, featuredRank: 1 }, 100, 0),
      gift("ordinary", { rating: 3, reviewCount: 1 }),
      gift("featured-in-stock", { featured: true, featuredRank: 2 }),
    ];
    expect(ids(sortGifts(list, "most-loved", ctx))).toEqual(["featured-in-stock", "ordinary", "featured-sold-out"]);
  });

  it("does not let featured override an explicit sort — the buyer's choice wins", () => {
    const list = [
      gift("featured-dear", { featured: true, featuredRank: 1 }, 900),
      gift("cheap", {}, 100),
      gift("mid", {}, 400),
    ];
    expect(ids(sortGifts(list, "price-asc", ctx))).toEqual(["cheap", "mid", "featured-dear"]);
    expect(ids(sortGifts(list, "price-desc", ctx))).toEqual(["featured-dear", "mid", "cheap"]);
  });

  it("does not let featured override 'nearest' either", () => {
    const list = [
      gift("featured-far", { featured: true, featuredRank: 1, distanceKm: 40 }),
      gift("near", { distanceKm: 2 }),
    ];
    expect(ids(sortGifts(list, "nearest", ctx))).toEqual(["near", "featured-far"]);
  });

  it("is unchanged for a catalogue with nothing featured", () => {
    const list = [gift("first"), gift("second"), gift("third")];
    expect(ids(sortGifts(list, "most-loved", ctx))).toEqual(["first", "second", "third"]);
  });

  it("does not mutate the list it was given", () => {
    const list = [gift("plain"), gift("featured", { featured: true, featuredRank: 1 })];
    sortGifts(list, "most-loved", ctx);
    expect(ids(list)).toEqual(["plain", "featured"]);
  });
});

describe("spreadByMaker", () => {
  const gift = (id: string, vendorId: string): Product =>
    ({
      id,
      vendorId,
      occasionIds: [],
      rating: 0,
      reviewCount: 0,
      weightOptions: [{ sku: `${id}-s`, stock: 5 }],
      defaultWeightSku: `${id}-s`,
    }) as unknown as Product;

  it("does not let one maker own the first rows", () => {
    // The owner's case: one storefront had listed ten things in a row, so
    // the whole first screenful was theirs and every other maker was
    // below the fold.
    const products = [
      ...Array.from({ length: 10 }, (_, i) => gift(`a${i}`, "maker-a")),
      gift("b1", "maker-b"),
      gift("c1", "maker-c"),
    ];
    const order = spreadByMaker(products).map((p) => p.vendorId);
    expect(order.slice(0, 3)).toEqual(["maker-a", "maker-b", "maker-c"]);
  });

  it("loses nothing and invents nothing", () => {
    // It runs under pagination, so it has to be a permutation: a listing
    // that appeared twice would show on two pages, and a dropped one is
    // a gift nobody can buy.
    const products = [gift("a1", "a"), gift("a2", "a"), gift("b1", "b"), gift("c1", "c")];
    const spread = spreadByMaker(products);
    expect(spread).toHaveLength(products.length);
    expect(new Set(spread.map((p) => p.id))).toEqual(new Set(products.map((p) => p.id)));
  });

  it("keeps the ranked order within one maker", () => {
    // Round-robin, not shuffle: the best listing of a maker still leads
    // that maker's queue.
    const products = [gift("a1", "a"), gift("a2", "a"), gift("b1", "b")];
    expect(spreadByMaker(products).map((p) => p.id)).toEqual(["a1", "b1", "a2"]);
  });

  it("leaves a single-maker catalogue exactly as ranked", () => {
    const products = [gift("a1", "a"), gift("a2", "a")];
    expect(spreadByMaker(products).map((p) => p.id)).toEqual(["a1", "a2"]);
  });

  it("is deterministic — the server and the browser must agree", () => {
    const products = [gift("a1", "a"), gift("b1", "b"), gift("a2", "a")];
    expect(spreadByMaker(products).map((p) => p.id)).toEqual(spreadByMaker(products).map((p) => p.id));
  });
});
