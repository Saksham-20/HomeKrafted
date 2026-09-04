import type { Product } from "@/lib/types";

/**
 * Which size a one-press "+" should add: the default size when it has
 * stock, otherwise the first size that does, otherwise `null` — nothing
 * can be added and the card says "Sold out". Pressing "+" on a listing
 * whose default size was at 0 used to 400 ("Only 0 in stock") and then
 * show "✓" anyway. Pure; unit-tested.
 */
export function purchasableSku(product: Pick<Product, "weightOptions" | "defaultWeightSku">): string | null {
  const options = product.weightOptions;
  const preferred = options.find((w) => w.sku === product.defaultWeightSku);
  if (preferred && preferred.stock > 0) return preferred.sku;
  return options.find((w) => w.stock > 0)?.sku ?? null;
}
