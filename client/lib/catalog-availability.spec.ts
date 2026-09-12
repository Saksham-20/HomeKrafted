import {
  isCatalogVisible,
  hasStock,
  isPurchasable,
  filterPurchasableListings,
} from "./catalog-availability";
import type { Product } from "./types";

function createMockProduct(patch: Partial<Product> = {}): Product {
  return {
    id: "prod-1",
    slug: "test-product",
    vendorId: "v-1",
    name: "Test Product",
    categoryId: "c-1",
    occasionIds: [],
    dietary: [],
    images: [],
    weightOptions: [{ sku: "sku-1", label: "Standard", price: 100, mrp: 120, stock: 10 }],
    defaultWeightSku: "sku-1",
    rating: 5,
    reviewCount: 1,
    tags: [],
    isPackaged: true,
    cashbackPct: 5,
    description: "A test description",
    isAvailable: true,
    moderationStatus: "active",
    ...patch,
  };
}

describe("catalog-availability", () => {
  it("hides items that are not approved", () => {
    expect(isCatalogVisible(createMockProduct({ moderationStatus: "pending" }))).toBe(false);
    expect(isCatalogVisible(createMockProduct({ moderationStatus: "rejected" }))).toBe(false);
    expect(isCatalogVisible(createMockProduct({ moderationStatus: "hidden" }))).toBe(false);
    expect(isCatalogVisible(createMockProduct({ moderationStatus: "active" }))).toBe(true);
  });

  it("hides items that are paused by the seller", () => {
    expect(isCatalogVisible(createMockProduct({ isAvailable: false }))).toBe(false);
    expect(isCatalogVisible(createMockProduct({ isAvailable: true }))).toBe(true);
  });

  it("determines stock correctly", () => {
    expect(
      hasStock(
        createMockProduct({
          weightOptions: [{ sku: "s1", label: "1", price: 10, mrp: 15, stock: 0 }],
        }),
      ),
    ).toBe(false);

    expect(
      hasStock(
        createMockProduct({
          weightOptions: [{ sku: "s1", label: "1", price: 10, mrp: 15, stock: 2 }],
        }),
      ),
    ).toBe(true);
  });

  it("determines purchasability correctly", () => {
    expect(isPurchasable(createMockProduct())).toBe(true);
    expect(isPurchasable(createMockProduct({ moderationStatus: "pending" }))).toBe(false);
    expect(
      isPurchasable(
        createMockProduct({
          weightOptions: [{ sku: "s1", label: "1", price: 10, mrp: 15, stock: 0 }],
        }),
      ),
    ).toBe(false);
  });

  it("filters buy-led collections to purchasable items only", () => {
    const list: Product[] = [
      createMockProduct({ id: "p1", moderationStatus: "active", isAvailable: true }),
      createMockProduct({ id: "p2", moderationStatus: "pending" }),
      createMockProduct({
        id: "p3",
        weightOptions: [{ sku: "s3", label: "1", price: 10, mrp: 15, stock: 0 }],
      }),
    ];

    const result = filterPurchasableListings(list);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("p1");
  });
});
