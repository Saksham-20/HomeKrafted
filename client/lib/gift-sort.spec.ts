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
