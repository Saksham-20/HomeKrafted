import { describeEmptyBrowse } from "./browse-empty";

describe("describeEmptyBrowse", () => {
  it("names the category and the filters, since the category is no longer a filter chip", () => {
    const copy = describeEmptyBrowse({
      noun: "gifts",
      category: { name: "Earrings" },
      filterLabels: ["Made to order", "On sale"],
      priceNarrowed: false,
    });
    expect(copy.headline).toBe("Nothing in Earrings matches Made to order + On sale.");
    expect(copy.canClearFilters).toBe(true);
    expect(copy.canShowAll).toBe(true);
  });

  it("names a subcategory's department, so the sentence reads without the rail in view", () => {
    const copy = describeEmptyBrowse({
      noun: "dishes",
      category: { name: "Punjabi", parentName: "Shop by cuisine" },
      filterLabels: ["Pure veg"],
      priceNarrowed: true,
    });
    expect(copy.headline).toBe(
      "Nothing in Punjabi (in Shop by cuisine) matches Pure veg in this price range.",
    );
  });

  it("blames the price alone when a narrowed price is the only refinement", () => {
    const copy = describeEmptyBrowse({
      noun: "gifts",
      category: { name: "Crochet" },
      filterLabels: [],
      priceNarrowed: true,
    });
    expect(copy.headline).toBe("Nothing in Crochet is in this price range.");
    expect(copy.canClearFilters).toBe(true);
  });

  it("an empty shelf with no filters offers only Show all — Clear filters would do nothing", () => {
    const copy = describeEmptyBrowse({
      noun: "gifts",
      category: { name: "Crochet" },
      filterLabels: [],
      priceNarrowed: false,
    });
    expect(copy.headline).toBe("No gifts in Crochet right now.");
    expect(copy.canClearFilters).toBe(false);
    expect(copy.canShowAll).toBe(true);
    expect(copy.hint).toBe("Try another category, or show everything.");
  });

  it("filters with no category read as before and offer no Show all", () => {
    const copy = describeEmptyBrowse({
      noun: "kitchens",
      category: null,
      filterLabels: ["Pure veg", "Ships pan-India"],
      priceNarrowed: false,
    });
    expect(copy.headline).toBe("Nothing matches Pure veg + Ships pan-India.");
    expect(copy.hint).toBe(
      "Every filter narrows the same catalogue — loosen one and the kitchens come back.",
    );
    expect(copy.canShowAll).toBe(false);
  });

  it("a bare empty view says so and offers nothing to undo", () => {
    const copy = describeEmptyBrowse({
      noun: "dishes",
      category: null,
      filterLabels: [],
      priceNarrowed: false,
    });
    expect(copy).toEqual({
      headline: "Nothing matches this view.",
      hint: null,
      canClearFilters: false,
      canShowAll: false,
    });
  });
});
