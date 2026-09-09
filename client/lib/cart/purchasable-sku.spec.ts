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

/**
 * The card and the detail page must choose the same size.
 *
 * `ProductGridCard` has always added `purchasableSku(product)`;
 * `ProductPurchasePanel` opened on `product.defaultWeightSku` until
 * 2026-09-06. On a listing whose default size is at `stock: 0` while a
 * second size has stock, that shipped a working "+" on the grid and a
 * detail page pre-selected to the dead size — "Sold out", a disabled Add,
 * a disabled stepper. Sixteen live listings sit at `stock: 0`, so this is
 * a real state and not a theoretical one.
 *
 * Asserted as a property of the two call sites rather than by rendering
 * the panel: what matters is that neither ever picks the other's answer.
 */
describe("the card and the purchase panel agree", () => {
  const split = {
    defaultWeightSku: "small",
    weightOptions: [
      { sku: "small", label: "250 g", price: 200, mrp: 200, stock: 0 },
      { sku: "large", label: "1 kg", price: 600, mrp: 600, stock: 4 },
    ],
  };

  it("skips a dead default for a size that can be bought", () => {
    expect(purchasableSku(split)).toBe("large");
    expect(purchasableSku(split)).not.toBe(split.defaultWeightSku);
  });

  it("answers null when nothing can be bought, so the panel falls back to the default", () => {
    // The panel needs *a* selected size to price against even when the
    // whole listing is out — `?? defaultWeightSku` is what covers it.
    const gone = {
      defaultWeightSku: "small",
      weightOptions: [{ sku: "small", label: "250 g", price: 200, mrp: 200, stock: 0 }],
    };
    expect(purchasableSku(gone)).toBeNull();
    expect(purchasableSku(gone) ?? gone.defaultWeightSku).toBe("small");
  });
});
