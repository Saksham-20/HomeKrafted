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
    expect(parseBrowseParams("category=pickles,sweets&occasion=diwali&diet=vegan&minPrice=100&maxPrice=500&sort=price-asc&page=3")).toEqual({
      categories: ["pickles", "sweets"],
      occasions: ["diwali"],
      dietary: ["vegan"],
      price: [100, 500],
      sort: "price-asc",
      page: 3,
    });
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

  it("omits the default sort and the first page", () => {
    expect(
      browseParamsToQuery({ ...DEFAULT_BROWSE_PARAMS, categories: ["pickles"] }),
    ).toBe("category=pickles");
  });

  it("round-trips a full state", () => {
    const state = {
      categories: ["pickles", "sweets"],
      occasions: ["diwali"],
      dietary: ["vegan" as const],
      price: [100, 500] as [number, number],
      sort: "price-desc" as const,
      page: 4,
    };
    expect(parseBrowseParams(browseParamsToQuery(state))).toEqual(state);
  });
});
