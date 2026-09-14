import {
  toSellerListingInput,
  type ListingFormValues,
  EMPTY_LISTING_FORM,
  validateListingForm,
  hasListingFormErrors,
  mergeVariantLabel,
  variantLabelError,
  VARIANT_LABEL_MAX,
  VARIANT_SKU_MAX,
  deriveSku,
  countListingFormErrors,
  firstListingErrorId,
  listingFieldId,
  LISTING_LIMITS,
  PREP_TIME_MAX_MINS,
} from "./listing-input";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("toSellerListingInput", () => {
  it("merges size and colour into label when both are present", () => {
    const values: ListingFormValues = {
      ...EMPTY_LISTING_FORM,
      name: "Handmade Candle",
      categoryId: "cat-1",
      description: "A lovely scented candle.",
      kind: "craft",
      weightRows: [
        {
          label: "Small",
          colour: "Rose gold",
          price: "249",
          mrp: "299",
          stock: "10",
        },
      ],
    };

    const input = toSellerListingInput(values);
    expect(input.weightOptions).toHaveLength(1);
    expect(input.weightOptions[0].label).toBe("Small · Rose gold");
    expect(input.weightOptions[0].sku).toBe("handmade-candle-small-rose-gold");
    expect(input.defaultWeightSku).toBe("handmade-candle-small-rose-gold");
  });

  it("supports multiple colours separated by commas for a single size", () => {
    const values: ListingFormValues = {
      ...EMPTY_LISTING_FORM,
      name: "Handmade Candle",
      categoryId: "cat-1",
      description: "A scented candle available in several colours.",
      kind: "craft",
      weightRows: [
        {
          label: "Medium",
          colour: "Rose gold, Matte Black, Ivory",
          price: "349",
          mrp: "399",
          stock: "15",
        },
      ],
    };

    const input = toSellerListingInput(values);
    expect(input.weightOptions).toHaveLength(1);
    expect(input.weightOptions[0].label).toBe("Medium · Rose gold, Matte Black, Ivory");
    expect(input.weightOptions[0].sku).toBe("handmade-candle-medium-rose-gold-matte-black-ivory");
  });


  it("handles colour-only and size-only variants correctly", () => {
    const values: ListingFormValues = {
      ...EMPTY_LISTING_FORM,
      name: "Ceramic Mug",
      categoryId: "cat-1",
      description: "Hand-thrown mug.",
      kind: "craft",
      weightRows: [
        {
          label: "",
          colour: "Sky Blue",
          price: "350",
          mrp: "400",
          stock: "5",
        },
        {
          label: "Large",
          colour: "",
          price: "450",
          mrp: "500",
          stock: "8",
        },
      ],
      defaultRowIndex: 1,
    };

    const input = toSellerListingInput(values);
    expect(input.weightOptions).toHaveLength(2);
    expect(input.weightOptions[0].label).toBe("Sky Blue");
    expect(input.weightOptions[0].sku).toBe("ceramic-mug-sky-blue");
    expect(input.weightOptions[1].label).toBe("Large");
    expect(input.weightOptions[1].sku).toBe("ceramic-mug-large");
    expect(input.defaultWeightSku).toBe("ceramic-mug-large");
  });

  it("supports multiple size tiers with prices and stocks", () => {
    const values: ListingFormValues = {
      ...EMPTY_LISTING_FORM,
      name: "Mango Pickle",
      categoryId: "cat-food",
      description: "Homemade sour mango pickle.",
      kind: "food",
      weightRows: [
        { label: "250 g", price: "180", mrp: "200", stock: "15" },
        { label: "500 g", price: "320", mrp: "350", stock: "10" },
        { label: "1 kg", price: "600", mrp: "650", stock: "5" },
      ],
      defaultRowIndex: 0,
    };

    const input = toSellerListingInput(values);
    expect(input.weightOptions).toHaveLength(3);
    expect(input.weightOptions[0].label).toBe("250 g");
    expect(input.weightOptions[0].price).toBe(180);
    expect(input.weightOptions[1].label).toBe("500 g");
    expect(input.weightOptions[1].price).toBe(320);
    expect(input.weightOptions[2].label).toBe("1 kg");
    expect(input.weightOptions[2].price).toBe(600);
    expect(input.defaultWeightSku).toBe(input.weightOptions[0].sku);
  });

  it("passes dimensions, material, careInstructions through for craft listings", () => {
    const values: ListingFormValues = {
      ...EMPTY_LISTING_FORM,
      name: "Soy Candle",
      categoryId: "cat-craft",
      description: "Hand-poured soy wax candle.",
      kind: "craft",
      dimensions: "8 × 8 × 10 cm",
      material: "100% Soy Wax, Cotton wick",
      careInstructions: "Keep away from direct sunlight",
      weightRows: [{ label: "Standard", price: "399", mrp: "449", stock: "20" }],
    };

    const input = toSellerListingInput(values);
    expect(input.dimensions).toBe("8 × 8 × 10 cm");
    expect(input.material).toBe("100% Soy Wax, Cotton wick");
    expect(input.careInstructions).toBe("Keep away from direct sunlight");
  });

  it("supports dimensions and specs across food and craft listings alike", () => {
    const values: ListingFormValues = {
      ...EMPTY_LISTING_FORM,
      name: "Besan Ladoo Gift Box",
      categoryId: "cat-food",
      description: "Classic gram-flour sweets in handcrafted box.",
      kind: "food",
      dimensions: "20 × 15 × 5 cm",
      material: "Tin box with gold foil",
      careInstructions: "Store in a cool dry place",
      prepTimeMins: "120",
      weightRows: [{ label: "Box of 12", price: "250", mrp: "280", stock: "30" }],
    };

    const input = toSellerListingInput(values);
    expect(input.dimensions).toBe("20 × 15 × 5 cm");
    expect(input.material).toBe("Tin box with gold foil");
    expect(input.careInstructions).toBe("Store in a cool dry place");
    expect(input.prepTimeMins).toBe(120);
  });

  it("omits spec fields when empty strings are provided", () => {
    const values: ListingFormValues = {
      ...EMPTY_LISTING_FORM,
      name: "Plain Dish",
      categoryId: "cat-food",
      description: "Simple home cooked meal.",
      kind: "food",
      dimensions: "   ",
      material: "",
      careInstructions: "   ",
      weightRows: [{ label: "1 portion", price: "150", mrp: "180", stock: "10" }],
    };

    const input = toSellerListingInput(values);
    expect(input.dimensions).toBeUndefined();
    expect(input.material).toBeUndefined();
    expect(input.careInstructions).toBeUndefined();
  });
});

describe("validateListingForm", () => {
  it("requires ingredients and shelf life for food items", () => {
    const values: ListingFormValues = {
      ...EMPTY_LISTING_FORM,
      name: "Fresh Paneer",
      categoryId: "cat-1",
      description: "Organic homemade soft paneer.",
      kind: "food",
      ingredients: "",
      shelfLife: "",
      weightRows: [{ label: "500g", price: "200", mrp: "220", stock: "10" }],
    };

    const errors = validateListingForm(values);
    expect(errors.ingredients).toBeDefined();
    expect(errors.shelfLife).toBeDefined();
    expect(hasListingFormErrors(errors)).toBe(true);
  });

  it("does not require ingredients or shelf life for craft items", () => {
    const values: ListingFormValues = {
      ...EMPTY_LISTING_FORM,
      name: "Handmade Vase",
      categoryId: "cat-craft",
      description: "Terracotta hand-painted vase.",
      kind: "craft",
      ingredients: "",
      shelfLife: "",
      weightRows: [{ label: "Standard", price: "500", mrp: "600", stock: "5" }],
    };

    const errors = validateListingForm(values);
    expect(errors.ingredients).toBeUndefined();
    expect(errors.shelfLife).toBeUndefined();
    expect(hasListingFormErrors(errors)).toBe(false);
  });
});

/**
 * Regression: the guided flow's colour swatches append to one string that
 * becomes `WeightOption.label`, capped at 40 by
 * `server/src/seller/dto/create-listing.dto.ts`. Nothing on the client
 * measured it, so the fifth swatch on a row built a listing the server
 * refused and the maker was shown the DTO's own words:
 * "weightOptions.0.label must be shorter than or equal to 40 characters".
 *
 * The 40 is computed against, not restated, so this fails if either side
 * moves without the other.
 */
describe("variant label length (the five-swatch refusal)", () => {
  const FIVE_SWATCHES = "Black, White, Cream, Rose gold, Gold";

  it("mirrors the server's cap exactly", () => {
    expect(VARIANT_LABEL_MAX).toBe(40);
  });

  it("merges size and colour the way the payload does", () => {
    expect(mergeVariantLabel("One", "Blush")).toBe("One · Blush");
    expect(mergeVariantLabel("", "Blush")).toBe("Blush");
    expect(mergeVariantLabel("One", "")).toBe("One");
    expect(mergeVariantLabel("  One  ", "  Blush  ")).toBe("One · Blush");
  });

  it("accepts four swatches and refuses five", () => {
    const four = "Black, White, Cream, Rose gold";
    expect(mergeVariantLabel("One", four).length).toBeLessThanOrEqual(VARIANT_LABEL_MAX);
    expect(variantLabelError("One", four)).toBeUndefined();

    expect(mergeVariantLabel("One", FIVE_SWATCHES).length).toBeGreaterThan(VARIANT_LABEL_MAX);
    expect(variantLabelError("One", FIVE_SWATCHES)).toBeDefined();
  });

  it("says it in the maker's words, never the server's field path", () => {
    const message = variantLabelError("One", FIVE_SWATCHES) ?? "";
    expect(message).not.toContain("weightOptions");
    expect(message).not.toContain("label must be");
    expect(message).toContain("Size and colour");
    // Names the way out, not just the problem.
    expect(message).toContain("another option");
  });

  it("blocks the save before the request, and marks the row", () => {
    const values: ListingFormValues = {
      ...EMPTY_LISTING_FORM,
      name: "Lily Crochet Flowers",
      categoryId: "cat-craft",
      description: "Hand-crocheted lilies tied with organza ribbon.",
      kind: "craft",
      weightRows: [
        { label: "One", colour: FIVE_SWATCHES, price: "359", mrp: "359", stock: "10" },
      ],
    };

    // The payload really would be refused — this is the bug, not a proxy for it.
    expect(toSellerListingInput(values).weightOptions[0].label.length).toBeGreaterThan(
      VARIANT_LABEL_MAX,
    );

    const errors = validateListingForm(values);
    expect(hasListingFormErrors(errors)).toBe(true);
    expect(errors.weightRows?.[0]).toBeDefined();
    expect(errors.weightRows?.[0]).not.toContain("weightOptions");
  });
});

/**
 * Regression: a HomeKrafter opened an existing listing to change its price
 * and was told "0 things are missing — they are marked on the form".
 *
 * Three separate faults produced that sentence, and each is pinned below.
 */
describe("editing an existing food listing (the unfindable refusal)", () => {
  /** What a food listing created before the food-safety change looks like. */
  const PRE_FOOD_SAFETY: ListingFormValues = {
    ...EMPTY_LISTING_FORM,
    name: "Mango Thokku Pickle",
    categoryId: "cat-pickles",
    description: "Slow-cooked raw mango pickle, the way my grandmother made it.",
    kind: "food",
    ingredients: "",
    shelfLife: "",
    weightRows: [{ sku: "mango-thokku-250-g", label: "250 g", price: "240", mrp: "240", stock: "8" }],
  };

  it("still refuses the save, which is correct", () => {
    const errors = validateListingForm(PRE_FOOD_SAFETY);
    expect(errors.ingredients).toBeDefined();
    expect(errors.shelfLife).toBeDefined();
    expect(hasListingFormErrors(errors)).toBe(true);
  });

  it("counts them — the banner said 0", () => {
    const errors = validateListingForm(PRE_FOOD_SAFETY);
    // The old count added up name + categoryId + description + weightRows,
    // none of which fail here, so the maker was told 0 things were missing.
    expect(countListingFormErrors(errors)).toBe(2);
  });

  it("names a field to jump to, so 'marked on the form' is true", () => {
    const errors = validateListingForm(PRE_FOOD_SAFETY);
    expect(firstListingErrorId(errors)).toBe(listingFieldId("ingredients"));
  });

  it("orders the jump by the form, not by key order", () => {
    const errors = validateListingForm({ ...PRE_FOOD_SAFETY, name: "" });
    // Name is above ingredients on the page, so it wins.
    expect(firstListingErrorId(errors)).toBe(listingFieldId("name"));
  });

  it("points at the right size row when a tier is the problem", () => {
    const errors = validateListingForm({
      ...PRE_FOOD_SAFETY,
      ingredients: "Raw mango, mustard oil",
      shelfLife: "30 days",
      weightRows: [
        { label: "250 g", price: "240", mrp: "240", stock: "8" },
        { label: "", price: "400", mrp: "400", stock: "4" },
      ],
    });
    expect(firstListingErrorId(errors)).toBe(listingFieldId("weightRows", 1));
  });

  it("a clean listing has nothing to jump to", () => {
    const errors = validateListingForm({
      ...PRE_FOOD_SAFETY,
      ingredients: "Raw mango, mustard oil, mustard seeds",
      shelfLife: "30 days refrigerated",
    });
    expect(hasListingFormErrors(errors)).toBe(false);
    expect(countListingFormErrors(errors)).toBe(0);
    expect(firstListingErrorId(errors)).toBeUndefined();
  });
});

describe("deriveSku — truncated, never refused", () => {
  it("leaves a short sku alone", () => {
    expect(deriveSku("Mango Thokku Pickle", "250 g")).toBe("mango-thokku-pickle-250-g");
  });

  it("keeps a long name inside the server's cap instead of failing the save", () => {
    const name =
      "Handmade Lily Crochet Flower Bouquet With Sheer White Organza Ribbon Gift Set";
    const label = "One · Black, White, Cream";
    // The old expression produced this and the server refused the listing.
    const naive = `${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
    expect(naive.length).toBeGreaterThan(VARIANT_SKU_MAX);

    const sku = deriveSku(name, label);
    expect(sku.length).toBeLessThanOrEqual(VARIANT_SKU_MAX);
    expect(sku).not.toMatch(/-$/);
    // The label half survives, so two sizes of one product stay distinct.
    expect(deriveSku(name, "Two · Black")).not.toBe(sku);
  });

  it("never returns an empty sku", () => {
    expect(deriveSku("!!!", "???", 2)).toBe("item-2");
  });

  it("an existing row keeps its stored sku", () => {
    const values: ListingFormValues = {
      ...EMPTY_LISTING_FORM,
      name: "Renamed Entirely",
      categoryId: "c",
      description: "d",
      kind: "craft",
      weightRows: [{ sku: "original-sku-from-the-first-save", label: "One", price: "1", mrp: "1", stock: "1" }],
    };
    // Renaming a product must not repoint a sku that is on past order lines.
    expect(toSellerListingInput(values).weightOptions[0].sku).toBe(
      "original-sku-from-the-first-save",
    );
  });
});

describe("every server limit is mirrored", () => {
  it("refuses an over-long value in the maker's words, not the DTO's", () => {
    const errors = validateListingForm({
      ...EMPTY_LISTING_FORM,
      name: "x".repeat(LISTING_LIMITS.name + 5),
      categoryId: "c",
      description: "d",
      kind: "craft",
      material: "m".repeat(LISTING_LIMITS.material + 1),
      weightRows: [{ label: "One", price: "1", mrp: "1", stock: "1" }],
    });
    expect(errors.name).toContain("too many");
    expect(errors.name).not.toContain("must be shorter than");
    expect(errors.material).toBeDefined();
  });

  it("catches a prep time over the server's 30-day ceiling", () => {
    const errors = validateListingForm({
      ...EMPTY_LISTING_FORM,
      name: "n",
      categoryId: "c",
      description: "d",
      kind: "craft",
      prepTimeMins: String(PREP_TIME_MAX_MINS + 1),
      weightRows: [{ label: "One", price: "1", mrp: "1", stock: "1" }],
    });
    expect(errors.prepTimeMins).toBeDefined();
    expect(errors.prepTimeMins).not.toContain("prepTimeMins");
  });

  /**
   * The drift guard. Reads the DTO and fails if it grows a `@MaxLength`
   * this file does not mirror — which is exactly how `weightOptions.0.sku`
   * and `.label` reached a home cook's screen.
   */
  it("mirrors every @MaxLength in the server DTO", () => {
    const dto = readFileSync(
      join(__dirname, "..", "..", "..", "server", "src", "seller", "dto", "create-listing.dto.ts"),
      "utf8",
    );
    // Strip comments: this repo quotes decorators in prose constantly.
    const code = dto
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/[^\n]*/g, "");

    const mirrored = new Set<number>([
      ...Object.values(LISTING_LIMITS),
      VARIANT_SKU_MAX,
      VARIANT_LABEL_MAX,
    ]);
    // `@TrimmedString(min, max)` is the project's own decorator.
    const caps = [
      ...code.matchAll(/@MaxLength\((\d+)\)/g),
      ...code.matchAll(/@TrimmedString\(\s*\d+\s*,\s*(\d+)\s*\)/g),
    ].map((m) => Number(m[1]));

    expect(caps.length).toBeGreaterThan(5);
    const unmirrored = caps.filter((cap) => !mirrored.has(cap));
    expect(unmirrored).toEqual([]);
  });
});
