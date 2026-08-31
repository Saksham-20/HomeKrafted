import {
  browseParamsToQuery,
  DEFAULT_BROWSE_PARAMS,
  parseBrowseParams,
} from "./browse-params";

/**
 * Everything here arrives from a URL, which means from anybody. The cases
 * that matter are the malformed ones: a browse page that throws, or that
 * filters itself to nothing, because somebody edited the address bar is
 * worse than one that ignores the nonsense and shows the catalogue.
 */
describe("reading browse state out of a URL", () => {
  it("reads a full state", () => {
    expect(parseBrowseParams("view=dishes&category=pickles,sweets&occasion=diwali&diet=vegan&tag=Bestseller&sale=1&ship=national&minPrice=100&maxPrice=500&sort=price-asc&page=3")).toEqual({
      view: "dishes",
      categories: ["pickles", "sweets"],
      occasions: ["diwali"],
      dietary: ["vegan"],
      tags: ["Bestseller"],
      sale: true,
      shipping: ["national"],
      price: [100, 500],
      sort: "price-asc",
      page: 3,
    });
  });

  it("a pre-M56 URL still parses identically, with the new fields at their defaults", () => {
    // Every shared /shop link written before tags/sale/shipping existed
    // must keep meaning exactly what it meant.
    const parsed = parseBrowseParams("category=pickles&sort=price-asc&page=2");
    expect(parsed.categories).toEqual(["pickles"]);
    expect(parsed.tags).toEqual([]);
    expect(parsed.sale).toBe(false);
    expect(parsed.shipping).toEqual([]);
  });

  it("drops a tag that is not one of ours", () => {
    expect(parseBrowseParams("tag=Bestseller,<script>,Festive").tags).toEqual([
      "Bestseller",
      "Festive",
    ]);
  });

  it.each([
    ["yes", "sale=yes"],
    ["true", "sale=true"],
    ["0", "sale=0"],
    ["empty", "sale="],
  ])("reads sale=%s as off — only the one spelling counts", (_label, query) => {
    expect(parseBrowseParams(query).sale).toBe(false);
  });

  it("drops an unknown shipping scope", () => {
    expect(parseBrowseParams("ship=national,overnight").shipping).toEqual(["national"]);
  });

  it("an empty query is the default state", () => {
    expect(parseBrowseParams("")).toEqual(DEFAULT_BROWSE_PARAMS);
  });

  it("keeps the single-slug form the home page's category tiles link to", () => {
    // `?category=pickles` predates this module and is what every category
    // tile on the home page emits. It must keep working.
    expect(parseBrowseParams("category=pickles").categories).toEqual(["pickles"]);
  });

  it.each([
    ["an unknown sort", "sort=cheapest"],
    ["an empty sort", "sort="],
    ["a sort of the wrong shape", "sort[]=price-asc"],
  ])("falls back to the default sort for %s", (_label, query) => {
    expect(parseBrowseParams(query).sort).toBe("most-loved");
  });

  it.each([
    ["an unknown view", "view=chefs"],
    ["an empty view", "view="],
    ["a view of the wrong shape", "view[]=dishes"],
  ])("falls back to the kitchens view for %s", (_label, query) => {
    // M51 — the food page opens on the kitchens cooking, and a URL
    // somebody hand-edited must not land on a half-rendered third view.
    expect(parseBrowseParams(query).view).toBe("kitchens");
  });

  it("reads the dishes view", () => {
    expect(parseBrowseParams("view=dishes").view).toBe("dishes");
  });

  it("accepts the nearest sort", () => {
    expect(parseBrowseParams("sort=nearest").sort).toBe("nearest");
  });

  it.each([
    ["zero", "page=0"],
    ["negative", "page=-3"],
    ["fractional", "page=1.5"],
    ["not a number", "page=two"],
    ["empty", "page="],
  ])("falls back to page 1 for %s", (_label, query) => {
    expect(parseBrowseParams(query).page).toBe(1);
  });

  it("ignores a half-stated price range", () => {
    // One bound alone says nothing about the other, and treating the
    // missing half as 0 would silently exclude everything above it.
    expect(parseBrowseParams("minPrice=100").price).toBeNull();
    expect(parseBrowseParams("maxPrice=500").price).toBeNull();
  });

  it("ignores an inverted or unparseable price range", () => {
    // min > max matches nothing, and an empty grid with a full sidebar
    // reads as the catalogue being gone.
    expect(parseBrowseParams("minPrice=500&maxPrice=100").price).toBeNull();
    expect(parseBrowseParams("minPrice=cheap&maxPrice=500").price).toBeNull();
    expect(parseBrowseParams("minPrice=&maxPrice=").price).toBeNull();
  });

  it("keeps a range where both ends are the same", () => {
    expect(parseBrowseParams("minPrice=200&maxPrice=200").price).toEqual([200, 200]);
  });

  it("drops a diet tag that is not one of ours", () => {
    expect(parseBrowseParams("diet=vegan,keto,gluten-free").dietary).toEqual([
      "vegan",
      "gluten-free",
    ]);
  });

  it("trims, drops empties and de-duplicates a list", () => {
    // `?category=pickles,,pickles, sweets` is what a hand-edited URL and a
    // double-click on a chip both produce.
    expect(parseBrowseParams("category=pickles,,pickles, sweets").categories).toEqual([
      "pickles",
      "sweets",
    ]);
  });
});

describe("writing browse state into a URL", () => {
  it("writes nothing when nothing is narrowed", () => {
    // An untouched /shop must stay /shop, or the canonical URL and the
    // address bar stop agreeing.
    expect(browseParamsToQuery(DEFAULT_BROWSE_PARAMS)).toBe("");
  });

  it("omits the default view", () => {
    // A visitor who never touched the toggle must not be handed
    // `?view=kitchens` to share — the default belongs in the code, not in
    // everybody's address bar.
    expect(browseParamsToQuery({ ...DEFAULT_BROWSE_PARAMS, view: "kitchens" })).toBe("");
    expect(browseParamsToQuery({ ...DEFAULT_BROWSE_PARAMS, view: "dishes" })).toBe("view=dishes");
  });

  it("omits the default sort and the first page", () => {
    expect(
      browseParamsToQuery({ ...DEFAULT_BROWSE_PARAMS, categories: ["pickles"] }),
    ).toBe("category=pickles");
  });

  it("omits empty tags, sale off and an empty shipping scope", () => {
    expect(
      browseParamsToQuery({ ...DEFAULT_BROWSE_PARAMS, categories: ["pickles"] }),
    ).not.toContain("tag");
    expect(
      browseParamsToQuery({ ...DEFAULT_BROWSE_PARAMS, categories: ["pickles"] }),
    ).not.toContain("sale");
    expect(
      browseParamsToQuery({ ...DEFAULT_BROWSE_PARAMS, categories: ["pickles"] }),
    ).not.toContain("ship");
  });

  it("round-trips a full state", () => {
    const state = {
      view: "dishes" as const,
      categories: ["pickles", "sweets"],
      occasions: ["diwali"],
      dietary: ["vegan" as const],
      tags: ["Bestseller" as const],
      sale: true,
      shipping: ["national" as const],
      price: [100, 500] as [number, number],
      sort: "price-desc" as const,
      page: 4,
    };
    expect(parseBrowseParams(browseParamsToQuery(state))).toEqual(state);
  });
});
