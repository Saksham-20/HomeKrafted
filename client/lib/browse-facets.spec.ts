import {
  DIETARY_OPTIONS,
  isOnSale,
  isOnShelf,
  productMatchesFacets,
  productShelves,
  type FacetSelection,
} from "./browse-facets";
import { DIETARY_TAG_VALUES } from "@/lib/types";
import type { Product } from "@/lib/types";

const base: Product = {
  id: "p1",
  slug: "test-pickle",
  vendorId: "vd1",
  name: "Test Pickle",
  categoryId: "ct1",
  occasionIds: ["oc3"],
  dietary: ["vegetarian"],
  images: [],
  weightOptions: [{ sku: "test-pickle-250g", label: "250 g", price: 200, mrp: 240, stock: 10 }],
  defaultWeightSku: "test-pickle-250g",
  rating: 4.5,
  reviewCount: 10,
  tags: ["Bestseller"],
  isPackaged: true,
  cashbackPct: 5,
  description: "x",
};

const none: FacetSelection = {
  categories: new Set(),
  occasions: new Set(),
  dietary: new Set(),
  tags: new Set(),
  sale: false,
  shipping: new Set(),
};

describe("isOnSale", () => {
  it("is presence, not arithmetic — no client ever computes a discount (M46)", () => {
    expect(isOnSale(base)).toBe(false);
    expect(isOnSale({ ...base, discountPct: 10 })).toBe(true);
    expect(
      isOnSale({
        ...base,
        weightOptions: [{ ...base.weightOptions[0], salePrice: 180 }],
      }),
    ).toBe(true);
  });
});

describe("productMatchesFacets", () => {
  it("an empty selection matches everything", () => {
    expect(productMatchesFacets(base, none)).toBe(true);
  });

  it("ANDs across facets, ORs within one", () => {
    expect(
      productMatchesFacets(base, { ...none, categories: new Set(["ct1", "ct2"]) }),
    ).toBe(true);
    expect(
      productMatchesFacets(base, {
        ...none,
        categories: new Set(["ct1"]),
        tags: new Set(["Festive"]),
      }),
    ).toBe(false);
  });

  it("reads an absent shippingScope as local — pre-M20 rows were local delivery", () => {
    expect(productMatchesFacets(base, { ...none, shipping: new Set(["local" as const]) })).toBe(
      true,
    );
    expect(
      productMatchesFacets(base, { ...none, shipping: new Set(["national" as const]) }),
    ).toBe(false);
    expect(
      productMatchesFacets(
        { ...base, shippingScope: "national" },
        { ...none, shipping: new Set(["national" as const]) },
      ),
    ).toBe(true);
  });

  it("sale narrows to discounted listings only", () => {
    expect(productMatchesFacets(base, { ...none, sale: true })).toBe(false);
    expect(productMatchesFacets({ ...base, discountPct: 10 }, { ...none, sale: true })).toBe(true);
  });
});

describe("M58 — a listing sits on several shelves", () => {
  // CLAUDE.md: `ProductCategory` "carries the complete set, primary
  // included ... that is what makes 'everything in this category' one
  // query instead of an OR across two places". The seller form has
  // written `categoryIds` since M58 and browse read only `categoryId`
  // until 2026-09-06, so a secondary shelf matched nothing, counted
  // nothing, and rendered as a dimmed-and-disabled "0" tile.
  const multi = { ...base, categoryIds: ["ct7"] } as Product;

  it("the complete set is the primary plus the extras", () => {
    expect(productShelves(base)).toEqual(["ct1"]);
    expect(productShelves(multi)).toEqual(["ct1", "ct7"]);
  });

  it("a pre-M58 payload reads as primary-only, not as empty", () => {
    expect(productShelves({ ...base, categoryIds: undefined } as Product)).toEqual(["ct1"]);
    expect(productShelves({ ...base, categoryIds: [] } as Product)).toEqual(["ct1"]);
  });

  it("membership answers for both, and for nothing else", () => {
    expect(isOnShelf(multi, "ct1")).toBe(true);
    expect(isOnShelf(multi, "ct7")).toBe(true);
    expect(isOnShelf(multi, "ct9")).toBe(false);
  });

  it("the category facet matches a secondary shelf", () => {
    expect(productMatchesFacets(multi, { ...none, categories: new Set(["ct7"]) })).toBe(true);
    // The primary still matches, and an unrelated shelf still does not —
    // this widened the filter, it did not open it.
    expect(productMatchesFacets(multi, { ...none, categories: new Set(["ct1"]) })).toBe(true);
    expect(productMatchesFacets(multi, { ...none, categories: new Set(["ct9"]) })).toBe(false);
    expect(productMatchesFacets(base, { ...none, categories: new Set(["ct7"]) })).toBe(false);
  });
});

it("DIETARY_OPTIONS offers every tag, in its own order", () => {
  // The list is ordered for buyers (veg and non-veg lead) and must still
  // be complete: a tag missing here is a filter the sheet never offers,
  // and `browse-params.ts` shipped exactly that failure for a day.
  expect([...DIETARY_OPTIONS].sort()).toEqual([...DIETARY_TAG_VALUES].sort());
  expect(DIETARY_OPTIONS.slice(0, 2)).toEqual(["vegetarian", "non-vegetarian"]);
});
