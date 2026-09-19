import { browseParamsToQuery, parseBrowseParams } from "./browse-params";
import {
  categoryAncestry,
  categorySlugsForUrl,
  expandShelfSelection,
  resolveCategorySelection,
  shelfCounts,
  shelfFamily,
  splitCategorySections,
  withSelectedShelf,
} from "./category-sections";
import type { Department } from "./api/catalog";
import type { Category, Product } from "./types";

const cat = (id: string, name: string, parentId?: string | null): Category => ({
  id,
  slug: id,
  name,
  imagePlaceholder: name,
  productCount: 0,
  parentId: parentId ?? null,
});

describe("splitCategorySections", () => {
  it("keeps childless top-level shelves flat, in the given order", () => {
    const { flat, sections } = splitCategorySections([
      cat("a", "Pickles"),
      cat("b", "Bakery"),
    ]);
    expect(flat.map((c) => c.id)).toEqual(["a", "b"]);
    expect(sections).toEqual([]);
  });

  it("renders an M58 parent as a section over its children, never as a flat row", () => {
    const { flat, sections } = splitCategorySections([
      cat("a", "Pickles"),
      cat("p", "Shop by cuisine"),
      cat("c1", "North Indian", "p"),
      cat("c2", "Punjabi", "p"),
    ]);
    expect(flat.map((c) => c.id)).toEqual(["a"]);
    expect(sections).toHaveLength(1);
    expect(sections[0].parent.id).toBe("p");
    expect(sections[0].children.map((c) => c.id)).toEqual(["c1", "c2"]);
  });

  it("treats a childless parent-shaped row as flat (nothing filed under it)", () => {
    const { flat, sections } = splitCategorySections([cat("p", "Shop by meal")]);
    expect(flat.map((c) => c.id)).toEqual(["p"]);
    expect(sections).toEqual([]);
  });

  it("handles absent parentId (pre-M58 rows) as top-level", () => {
    const legacy = { ...cat("x", "Chutneys") };
    delete (legacy as { parentId?: string | null }).parentId;
    const { flat } = splitCategorySections([legacy]);
    expect(flat.map((c) => c.id)).toEqual(["x"]);
  });
});

describe("shelfFamily / expandShelfSelection (D3: a parent is selectable)", () => {
  const tree = [
    cat("jewel", "Handmade Jewellery"),
    cat("earrings", "Earrings", "jewel"),
    cat("rings", "Rings", "jewel"),
    cat("crochet", "Crochet"),
  ];

  it("a parent covers itself and its children — listings filed on the parent included", () => {
    expect(shelfFamily("jewel", tree)).toEqual(["jewel", "earrings", "rings"]);
  });

  it("a child or a childless shelf covers only itself", () => {
    expect(shelfFamily("earrings", tree)).toEqual(["earrings"]);
    expect(shelfFamily("crochet", tree)).toEqual(["crochet"]);
  });

  it("expands every selected parent and keeps selected children as they are", () => {
    expect([...expandShelfSelection(["jewel", "crochet"], tree)].sort()).toEqual(
      ["crochet", "earrings", "jewel", "rings"],
    );
    expect([...expandShelfSelection([], tree)]).toEqual([]);
  });
});

/*
  Slugs are deliberately not the ids here — the URL carries slugs and the
  filters hold ids, and a fixture where the two are equal would pass a
  resolver that returned the token unchanged.
*/
const slugged = (id: string, slug: string, parentId?: string | null): Category => ({
  ...cat(id, slug, parentId),
  slug,
});

describe("resolveCategorySelection (a category is one scope, not a set)", () => {
  const shelves = [
    slugged("ct1", "pickles"),
    slugged("ct2", "sweets"),
    slugged("ct3", "jewellery"),
    slugged("ct4", "earrings", "ct3"),
  ];

  it("answers the first slug that names a category, as an id", () => {
    expect(resolveCategorySelection(["pickles"], shelves)).toBe("ct1");
    expect(resolveCategorySelection(["earrings"], shelves)).toBe("ct4");
  });

  it("opens a legacy multi-select link on its first category", () => {
    // `?category=pickles,sweets` was written by the old checkbox rail.
    expect(resolveCategorySelection(["pickles", "sweets"], shelves)).toBe("ct1");
    expect(resolveCategorySelection(["sweets", "pickles"], shelves)).toBe("ct2");
  });

  it("skips an unknown first slug rather than giving up on the link", () => {
    expect(resolveCategorySelection(["renamed-shelf", "sweets"], shelves)).toBe("ct2");
  });

  it("is All (null) when nothing resolves — the catalogue, never an empty grid", () => {
    expect(resolveCategorySelection([], shelves)).toBeNull();
    expect(resolveCategorySelection(["renamed-shelf"], shelves)).toBeNull();
    // A craft slug handed to the food page's shelves is just unknown there.
    expect(resolveCategorySelection(["jewellery"], [slugged("ct1", "pickles")])).toBeNull();
    expect(resolveCategorySelection(["pickles"], [])).toBeNull();
  });

  it("accepts an id where no slug matches, and lets the slug win a collision", () => {
    expect(resolveCategorySelection(["ct2"], shelves)).toBe("ct2");
    const collide = [slugged("a", "b"), slugged("b", "a")];
    // "a" is shelf `a`'s id and shelf `b`'s slug — slug first.
    expect(resolveCategorySelection(["a"], collide)).toBe("b");
  });

  it("treats a parent shelf like any other — expandShelfSelection is what widens it", () => {
    expect(resolveCategorySelection(["jewellery"], shelves)).toBe("ct3");
  });
});

describe("categorySlugsForUrl (the writer emits at most one slug)", () => {
  const shelves = [slugged("ct1", "pickles"), slugged("ct2", "sweets")];

  it("is [] for All and for an id nobody carries", () => {
    expect(categorySlugsForUrl(null, shelves)).toEqual([]);
    expect(categorySlugsForUrl("ct9", shelves)).toEqual([]);
  });

  it("is the one slug otherwise", () => {
    expect(categorySlugsForUrl("ct2", shelves)).toEqual(["sweets"]);
  });

  it("round-trips a legacy URL into a canonical one through the real codec", () => {
    // What the hook does on mount: parse, resolve, write. The guard then
    // sees a different query and replaces the address bar.
    const legacy = parseBrowseParams("category=pickles,sweets&utm_source=x&diet=vegan");
    const id = resolveCategorySelection(legacy.categories, shelves);
    const query = browseParamsToQuery({ ...legacy, categories: categorySlugsForUrl(id, shelves) });
    expect(new URLSearchParams(query).getAll("category")).toEqual(["pickles"]);
    // Other owned keys ride along untouched.
    expect(new URLSearchParams(query).get("diet")).toBe("vegan");
  });

  it("writes no category param for All", () => {
    const query = browseParamsToQuery({
      ...parseBrowseParams("category=gone&sort=price-asc"),
      categories: categorySlugsForUrl(null, shelves),
    });
    expect(query).toBe("sort=price-asc");
  });
});

describe("categoryAncestry (top-level first, itself last)", () => {
  const tree = [
    cat("jewel", "Handmade Jewellery"),
    cat("earrings", "Earrings", "jewel"),
    cat("crochet", "Crochet"),
  ];

  it("a child is its parent then itself", () => {
    expect(categoryAncestry("earrings", tree).map((c) => c.id)).toEqual(["jewel", "earrings"]);
  });

  it("a top-level shelf is just itself", () => {
    expect(categoryAncestry("crochet", tree).map((c) => c.id)).toEqual(["crochet"]);
    expect(categoryAncestry("jewel", tree).map((c) => c.id)).toEqual(["jewel"]);
  });

  it("is empty for an unknown id", () => {
    expect(categoryAncestry("nope", tree)).toEqual([]);
  });

  it("ends the chain early when the parent is not in the list handed over", () => {
    // Each page passes only its own vertical's shelves.
    expect(categoryAncestry("earrings", [tree[1]]).map((c) => c.id)).toEqual(["earrings"]);
  });

  it("stops on a loop in the data instead of hanging", () => {
    const loop = [cat("a", "A", "b"), cat("b", "B", "a")];
    expect(categoryAncestry("a", loop).map((c) => c.id)).toEqual(["b", "a"]);
  });
});

describe("shelfCounts", () => {
  const product = (id: string, categoryId: string, categoryIds?: string[]): Product =>
    ({ id, categoryId, categoryIds }) as Product;

  const tree = [
    cat("jewel", "Handmade Jewellery"),
    cat("earrings", "Earrings", "jewel"),
    cat("rings", "Rings", "jewel"),
    cat("crochet", "Crochet"),
  ];

  it("counts every shelf a listing is filed under, not its primary alone", () => {
    const counts = shelfCounts(
      [product("p1", "crochet", ["earrings"]), product("p2", "crochet")],
      tree,
    );
    expect(counts.get("crochet")).toBe(2);
    expect(counts.get("earrings")).toBe(1);
    expect(counts.get("rings")).toBeUndefined();
  });

  it("a parent counts its whole family once per listing", () => {
    const counts = shelfCounts(
      [
        product("p1", "earrings"),
        // Two of the parent's children: still one piece under the parent.
        product("p2", "earrings", ["rings"]),
        // Filed directly on the parent — the D3 listings a child chip misses.
        product("p3", "jewel"),
        product("p4", "crochet"),
      ],
      tree,
    );
    expect(counts.get("jewel")).toBe(3);
    expect(counts.get("earrings")).toBe(2);
    expect(counts.get("rings")).toBe(1);
    expect(counts.get("crochet")).toBe(1);
  });

  it("does not double-count a listing whose extras repeat its primary", () => {
    expect(shelfCounts([product("p1", "crochet", ["crochet"])], tree).get("crochet")).toBe(1);
  });
});

describe("withSelectedShelf (a chosen shelf stays on the department strip)", () => {
  const dept = (id: string, children: Department["children"] = []): Department => ({
    id,
    slug: id,
    name: id,
    description: null,
    icon: null,
    count: 3,
    imageSrc: null,
    children,
  });
  const child = (id: string) => ({ id, slug: id, name: id, icon: null, count: 2 });
  const tree = [
    cat("jewel", "Jewellery"),
    cat("earrings", "Earrings", "jewel"),
    cat("bangles", "Bangles", "jewel"),
    cat("candles", "Candles"),
    cat("empty-parent", "Toys"),
    cat("puzzles", "Puzzles", "empty-parent"),
  ];

  it("returns the very same array when nothing is chosen", () => {
    const strip = [dept("jewel")];
    expect(withSelectedShelf(strip, null, tree)).toBe(strip);
  });

  it("returns the same array when the choice is already a department on the strip", () => {
    const strip = [dept("jewel")];
    expect(withSelectedShelf(strip, "jewel", tree)).toBe(strip);
  });

  it("returns the same array when the choice is a subcategory already on the strip", () => {
    const strip = [dept("jewel", [child("earrings")])];
    expect(withSelectedShelf(strip, "earrings", tree)).toBe(strip);
  });

  it("returns the same array for an id no shelf carries — nothing to retain", () => {
    const strip = [dept("jewel")];
    expect(withSelectedShelf(strip, "ghost", tree)).toBe(strip);
  });

  it("appends an empty top-level shelf with a zero count, leaving the rest where they were", () => {
    const strip = [dept("jewel"), dept("candles")];
    const out = withSelectedShelf(strip, "empty-parent", tree);
    expect(out.map((d) => d.id)).toEqual(["jewel", "candles", "empty-parent"]);
    expect(out[2]).toMatchObject({ id: "empty-parent", name: "Toys", count: 0, children: [] });
  });

  it("puts an empty subcategory back under its department, which is still there", () => {
    const strip = [dept("jewel", [child("bangles")])];
    const out = withSelectedShelf(strip, "earrings", tree);
    expect(out.map((d) => d.id)).toEqual(["jewel"]);
    expect(out[0].children.map((c) => c.id)).toEqual(["bangles", "earrings"]);
    expect(out[0].children[1].count).toBe(0);
    // The department's own figure is the server's and is not touched.
    expect(out[0].count).toBe(3);
  });

  it("brings back the department too when the whole department was empty", () => {
    const strip = [dept("jewel")];
    const out = withSelectedShelf(strip, "puzzles", tree);
    expect(out.map((d) => d.id)).toEqual(["jewel", "empty-parent"]);
    expect(out[1]).toMatchObject({ count: 0 });
    expect(out[1].children.map((c) => c.id)).toEqual(["puzzles"]);
  });

  it("does not mutate what it was given", () => {
    const strip = [dept("jewel", [child("bangles")])];
    const snapshot = JSON.stringify(strip);
    withSelectedShelf(strip, "earrings", tree);
    expect(JSON.stringify(strip)).toBe(snapshot);
  });
});
