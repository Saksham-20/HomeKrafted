import type { Category, Product } from "@/lib/types";
import { festiveGiftEdit } from "./festive-gifts";

const categories = [
  { id: "h", slug: "hampers", name: "Hampers" },
  { id: "c", slug: "candles", name: "Candles" },
  { id: "y", slug: "crochet", name: "Crochet" },
] as Category[];

function product(id: string, categoryId: string, extra: Partial<Product> = {}): Product {
  return {
    id,
    slug: id,
    vendorId: "v",
    name: id,
    categoryId,
    occasionIds: [],
    dietary: [],
    images: [],
    weightOptions: [],
    defaultWeightSku: "",
    rating: 0,
    reviewCount: 0,
    tags: [],
    isPackaged: true,
    kind: "craft",
    ...extra,
  } as Product;
}

describe("festiveGiftEdit", () => {
  it("leads with a hamper, a candle and crochet when each exists", () => {
    const result = festiveGiftEdit(
      [
        product("other", "h"),
        product("crochet-toy", "y"),
        product("soy-candle", "c"),
        product("diwali-box", "h", { isHamper: true, kind: "food" }),
      ],
      categories,
      "diwali",
    );
    expect(result.slice(0, 3).map((item) => item.id)).toEqual([
      "diwali-box",
      "soy-candle",
      "crochet-toy",
    ]);
  });

  it("uses the occasion before filling with the remaining craft catalogue", () => {
    const result = festiveGiftEdit(
      [
        product("plain", "y"),
        product("festive", "y", { occasionIds: ["diwali"] }),
      ],
      categories,
      "diwali",
    );
    expect(result.map((item) => item.id)).toEqual(["festive", "plain"]);
  });
});
