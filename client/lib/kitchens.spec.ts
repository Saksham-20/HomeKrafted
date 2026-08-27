import { buildKitchens, listingPrice, sortKitchens, type Kitchen } from "./kitchens";
import type { Category, DietaryTag, Product, Vendor } from "@/lib/types";

/**
 * The food page opens on kitchens, and every number on a kitchen card is
 * derived here rather than fetched. The cases that matter are the ones
 * where a wrong derivation would be *believable on screen*: a "Pure veg"
 * badge over a kitchen that also sells eggs, a distance invented for a
 * buyer who never shared one, and a kitchen whose vendor row is missing
 * rendering as a nameless card.
 */

function vendor(id: string, patch: Partial<Vendor> = {}): Vendor {
  return {
    id,
    slug: id,
    name: `Kitchen ${id}`,
    type: "maker",
    bio: "",
    avatarPlaceholder: "",
    bannerPlaceholder: "",
    location: "Sector 35, Chandigarh",
    area: "chandigarh-35",
    lat: 30.7,
    lng: 76.7,
    deliveryRadiusKm: 8,
    rating: 4.5,
    reviewCount: 10,
    followerCount: 0,
    joinedAt: "2026-01-01T00:00:00.000Z",
    ...patch,
  };
}

function product(id: string, vendorId: string, patch: Partial<Product> = {}): Product {
  return {
    id,
    slug: id,
    vendorId,
    name: `Dish ${id}`,
    categoryId: "ct1",
    occasionIds: [],
    dietary: ["vegetarian"] as DietaryTag[],
    images: [],
    weightOptions: [{ sku: `${id}-250g`, label: "250 g", price: 200, mrp: 200, stock: 5 }],
    defaultWeightSku: `${id}-250g`,
    rating: 4.5,
    reviewCount: 4,
    tags: [],
    isPackaged: true,
    cashbackPct: 0,
    description: "",
    ...patch,
  };
}

const categories: Category[] = [
  { id: "ct1", slug: "pickles", name: "Pickles", imagePlaceholder: "", productCount: 0 },
  { id: "ct2", slug: "sweets", name: "Sweets", imagePlaceholder: "", productCount: 0 },
];

describe("grouping listings into kitchens", () => {
  it("groups by vendor, best-rated dish first", () => {
    const kitchens = buildKitchens(
      [
        product("a", "v1", { rating: 4.2 }),
        product("b", "v1", { rating: 4.9 }),
        product("c", "v2"),
      ],
      [vendor("v1"), vendor("v2")],
      categories,
    );

    expect(kitchens).toHaveLength(2);
    const v1 = kitchens.find((k) => k.vendor.id === "v1") as Kitchen;
    expect(v1.dishes.map((d) => d.id)).toEqual(["b", "a"]);
  });

  it("drops a listing whose kitchen is missing rather than rendering a nameless card", () => {
    const kitchens = buildKitchens([product("a", "ghost")], [vendor("v1")], categories);
    expect(kitchens).toEqual([]);
  });

  it("a kitchen with nothing live does not appear", () => {
    // The page answers "what can I eat tonight". A kitchen approved this
    // morning belongs on the home page's maker rail, not in this grid.
    const kitchens = buildKitchens([], [vendor("v1")], categories);
    expect(kitchens).toEqual([]);
  });

  it("takes the cheapest default option as the from-price", () => {
    // The *default* option's price, not the cheapest option of the
    // cheapest dish — the card and the listing one click later have to
    // quote the same number.
    const kitchens = buildKitchens(
      [
        product("a", "v1", {
          weightOptions: [
            { sku: "a-100g", label: "100 g", price: 90, mrp: 90, stock: 1 },
            { sku: "a-250g", label: "250 g", price: 260, mrp: 260, stock: 1 },
          ],
          defaultWeightSku: "a-250g",
        }),
        product("b", "v1", { weightOptions: [{ sku: "b-1", label: "1", price: 180, mrp: 180, stock: 1 }], defaultWeightSku: "b-1" }),
      ],
      [vendor("v1")],
      categories,
    );
    expect(kitchens[0].fromPrice).toBe(180);
  });

  it("names what they mostly make, most-listed first, three at most", () => {
    const kitchens = buildKitchens(
      [
        product("a", "v1", { categoryId: "ct2" }),
        product("b", "v1", { categoryId: "ct1" }),
        product("c", "v1", { categoryId: "ct1" }),
      ],
      [vendor("v1")],
      categories,
    );
    expect(kitchens[0].makes).toEqual(["Pickles", "Sweets"]);
  });

  it("drops a category the listing points at but the page does not carry", () => {
    // `/shop` scopes its categories to food; a craft category id on a
    // food listing must not render as `undefined` in the tag row.
    const kitchens = buildKitchens([product("a", "v1", { categoryId: "ct-craft" })], [vendor("v1")], categories);
    expect(kitchens[0].makes).toEqual([]);
  });

  it("claims pure veg only when every dish is vegetarian", () => {
    const mixed = buildKitchens(
      [product("a", "v1"), product("b", "v1", { dietary: [] })],
      [vendor("v1")],
      categories,
    );
    expect(mixed[0].allVegetarian).toBe(false);

    const allVeg = buildKitchens([product("a", "v1"), product("b", "v1")], [vendor("v1")], categories);
    expect(allVeg[0].allVegetarian).toBe(true);
  });

  it("carries a distance only when the listings had one", () => {
    const unknown = buildKitchens([product("a", "v1")], [vendor("v1")], categories);
    expect(unknown[0].distanceKm).toBeUndefined();
    expect(unknown[0].distanceLabel).toBeUndefined();

    const known = buildKitchens(
      [product("a", "v1", { distanceKm: 4.6, distanceLabel: "4.6 km" })],
      [vendor("v1")],
      categories,
    );
    expect(known[0].distanceKm).toBe(4.6);
  });
});

describe("ordering kitchens", () => {
  const build = () =>
    buildKitchens(
      [
        product("a", "v1", { weightOptions: [{ sku: "a", label: "a", price: 300, mrp: 300, stock: 1 }], defaultWeightSku: "a", distanceKm: 9 }),
        product("b", "v2", { weightOptions: [{ sku: "b", label: "b", price: 100, mrp: 100, stock: 1 }], defaultWeightSku: "b", distanceKm: 2 }),
        product("c", "v3", { weightOptions: [{ sku: "c", label: "c", price: 200, mrp: 200, stock: 1 }], defaultWeightSku: "c" }),
      ],
      [
        vendor("v1", { rating: 4.9, reviewCount: 3 }),
        vendor("v2", { rating: 4.1, reviewCount: 90 }),
        vendor("v3", { rating: 4.9, reviewCount: 40 }),
      ],
      categories,
    );

  const ids = (kitchens: Kitchen[]) => kitchens.map((k) => k.vendor.id);

  it("most loved is rating, then how many people said so", () => {
    expect(ids(sortKitchens(build(), "most-loved"))).toEqual(["v3", "v1", "v2"]);
  });

  it("price sorts read the kitchen's cheapest dish", () => {
    expect(ids(sortKitchens(build(), "price-asc"))).toEqual(["v2", "v3", "v1"]);
    expect(ids(sortKitchens(build(), "price-desc"))).toEqual(["v1", "v3", "v2"]);
  });

  it("nearest puts an unknown distance last, never first", () => {
    // "We were not told where you are" is not "next door". A kitchen with
    // no distance sorting to the top of a nearest-first list is a lie the
    // buyer cannot see.
    expect(ids(sortKitchens(build(), "nearest"))).toEqual(["v2", "v1", "v3"]);
  });

  it("does not mutate what it was handed", () => {
    const kitchens = build();
    const before = ids(kitchens);
    sortKitchens(kitchens, "price-asc");
    expect(ids(kitchens)).toEqual(before);
  });
});

describe("the price a card quotes", () => {
  it("is the default option, not the cheapest one", () => {
    expect(
      listingPrice(
        product("a", "v1", {
          weightOptions: [
            { sku: "a-100g", label: "100 g", price: 90, mrp: 90, stock: 1 },
            { sku: "a-250g", label: "250 g", price: 260, mrp: 260, stock: 1 },
          ],
          defaultWeightSku: "a-250g",
        }),
      ),
    ).toBe(260);
  });

  it("falls back to the first option when the default sku is gone", () => {
    expect(
      listingPrice(
        product("a", "v1", {
          weightOptions: [{ sku: "a-100g", label: "100 g", price: 90, mrp: 90, stock: 1 }],
          defaultWeightSku: "deleted",
        }),
      ),
    ).toBe(90);
  });
});
