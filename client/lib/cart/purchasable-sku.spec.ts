import { purchasableSku } from "./purchasable-sku";

const opt = (sku: string, stock: number) => ({ sku, label: sku, price: 100, mrp: 100, stock });

describe("purchasableSku", () => {
  it("prefers the default size when it has stock", () => {
    expect(purchasableSku({ defaultWeightSku: "b", weightOptions: [opt("a", 5), opt("b", 2)] })).toBe("b");
  });

  it("falls through to the first in-stock size when the default is at 0", () => {
    expect(purchasableSku({ defaultWeightSku: "a", weightOptions: [opt("a", 0), opt("b", 3)] })).toBe("b");
  });

  it("is null when nothing can be added — the card says sold out, never 400s", () => {
    expect(purchasableSku({ defaultWeightSku: "a", weightOptions: [opt("a", 0), opt("b", 0)] })).toBeNull();
    expect(purchasableSku({ defaultWeightSku: "a", weightOptions: [] })).toBeNull();
  });
});
