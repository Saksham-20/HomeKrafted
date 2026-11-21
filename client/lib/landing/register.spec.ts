import type { Product } from "@/lib/types";
import { interleave, isComboProduct, registerView } from "./register";

function product(id: string, extra: Partial<Product> = {}): Product {
  return {
    id,
    slug: id,
    vendorId: "v",
    name: id,
    categoryId: "c",
    occasionIds: [],
    dietary: [],
    images: [],
    weightOptions: [],
    defaultWeightSku: "",
    rating: 0,
    reviewCount: 0,
    tags: [],
    isPackaged: false,
    ...extra,
  } as Product;
}

describe("landing register", () => {
  it("interleaves gifts first", () => {
    const craft = [product("c1"), product("c2")];
    const food = [product("f1")];
    expect(interleave(craft, food).map((p) => p.id)).toEqual(["c1", "f1", "c2"]);
  });

  it("recognises a combo by hamper flag, category or name", () => {
    expect(isComboProduct(product("a", { isHamper: true }))).toBe(true);
    expect(isComboProduct(product("b", { categoryId: "combos" }))).toBe(true);
    expect(isComboProduct(product("Festive thali"))).toBe(true);
    expect(isComboProduct(product("Mango pickle"))).toBe(false);
  });

  it("filters and caps the chosen list", () => {
    const lists = {
      bestsellers: {
        craft: [product("c1"), product("c2")],
        food: [product("Snack box"), product("f2")],
      },
      trending: { craft: [], food: [product("t1")] },
    };
    expect(registerView(lists, "bestsellers", "gifts").map((p) => p.id)).toEqual(["c1", "c2"]);
    expect(registerView(lists, "bestsellers", "combos").map((p) => p.id)).toEqual(["Snack box"]);
    expect(registerView(lists, "bestsellers", "all", 3).map((p) => p.id)).toEqual([
      "c1",
      "Snack box",
      "c2",
    ]);
    expect(registerView(lists, "trending", "gifts")).toEqual([]);
  });
});
