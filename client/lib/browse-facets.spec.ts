import { isOnSale, productMatchesFacets, type FacetSelection } from "./browse-facets";
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
