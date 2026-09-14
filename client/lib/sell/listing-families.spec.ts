import {
  FAMILY_FIELDS,
  asksFor,
  isPersonalisedListing,
  isRecipientShelf,
  requires,
  resolveFamily,
  splitAllergens,
  type ListingFamily,
  ALLERGEN_OPTIONS,
  ALLERGEN_NONE,
} from "./listing-families";
import {
  EMPTY_LISTING_FORM,
  LISTING_FIELD_ORDER,
  hasListingFormErrors,
  validateListingForm,
  type ListingFormValues,
} from "./listing-input";

/**
 * The form asked one set of questions to everybody, branching only on
 * `kind === "craft"` and only to change placeholder text. These are the
 * cases where that was wrong in a way somebody could feel.
 */
describe("resolveFamily", () => {
  it("reads the category the maker picked for this listing", () => {
    expect(resolveFamily({ kind: "food", categorySlug: "pickles" })).toBe("jarred");
    expect(resolveFamily({ kind: "food", categorySlug: "punjabi" })).toBe("cooked");
    expect(resolveFamily({ kind: "food", categorySlug: "cookies" })).toBe("baked");
    expect(resolveFamily({ kind: "craft", categorySlug: "earrings" })).toBe("worn");
    expect(resolveFamily({ kind: "craft", categorySlug: "scented-candles" })).toBe("room");
  });

  it("beats the account's specialties, because one kitchen sells both", () => {
    // A home cook tagged `homemade_food` listing a jar of pickle gets the
    // jar questions, not the thali ones.
    expect(
      resolveFamily({
        kind: "food",
        categorySlug: "pickles",
        specialties: ["homemade_food"],
      }),
    ).toBe("jarred");
  });

  it("falls back to specialties when the category cannot say", () => {
    expect(resolveFamily({ kind: "craft", specialties: ["bath_body"] })).toBe("skin");
    expect(resolveFamily({ kind: "craft", specialties: ["jewellery"] })).toBe("worn");
  });

  it("does not read a recipient shelf as a product type", () => {
    // "For her" says who it is for. Guessing a family from it would ask a
    // candle maker about shelf life with more confidence, not less.
    expect(isRecipientShelf("for-her")).toBe(true);
    expect(resolveFamily({ kind: "craft", categorySlug: "for-her" })).toBe("general");
    // ...but a specialty still resolves it.
    expect(
      resolveFamily({ kind: "craft", categorySlug: "for-her", specialties: ["ceramics"] }),
    ).toBe("room");
  });

  it("asks less rather than guessing more on an unknown shelf", () => {
    // A shelf an admin added after this map was written.
    expect(resolveFamily({ kind: "craft", categorySlug: "brand-new-shelf" })).toBe("general");
    expect(FAMILY_FIELDS.general.required).toEqual([]);
  });

  it("never returns undefined", () => {
    expect(resolveFamily({ kind: "food" })).toBe("cooked");
    expect(resolveFamily({ kind: "craft" })).toBe("general");
  });

  it("spots a made-to-order shelf", () => {
    expect(isPersonalisedListing("engraved")).toBe(true);
    expect(isPersonalisedListing("scented-candles")).toBe(false);
  });
});

describe("what each family is asked", () => {
  it("does not ask a thali for a shelf life", () => {
    // Cooked after the order and eaten today. The old rule required this of
    // everything filed as food.
    expect(requires("cooked", "shelfLife")).toBe(false);
    expect(requires("jarred", "shelfLife")).toBe(true);
  });

  it("does not ask a candle about refrigeration or a curry about care", () => {
    expect(asksFor("room", "ingredients")).toBe(false);
    expect(asksFor("room", "shelfLife")).toBe(false);
    expect(asksFor("cooked", "careInstructions")).toBe(false);
    expect(asksFor("cooked", "material")).toBe(false);
  });

  it("asks a bar of soap what is in it — the binary this breaks", () => {
    // `bath_body` is filed as craft, so the old `kind === "food"` gate hid
    // the ingredient question from the one product that goes on skin.
    expect(requires("skin", "ingredients")).toBe(true);
    expect(asksFor("skin", "allergens")).toBe(true);
    // And does not ask it whether it is vegetarian.
    expect(asksFor("skin", "dietary")).toBe(false);
  });

  it("asks a worn piece for its size, because fit is the return reason", () => {
    expect(requires("worn", "dimensions")).toBe(true);
    expect(requires("room", "dimensions")).toBe(true);
  });

  it("keeps every required set small", () => {
    // Conditional disclosure only shortens a form if what remains is short.
    for (const [family, fields] of Object.entries(FAMILY_FIELDS)) {
      expect(fields.required.length).toBeLessThanOrEqual(3);
      expect(new Set(fields.required).size).toBe(fields.required.length);
      // A field is required or encouraged, never both.
      for (const key of fields.required) {
        expect(fields.encouraged).not.toContain(key);
      }
      expect(family).toBeTruthy();
    }
  });

  it("asks for allergens everywhere it matters but blocks on none of it", () => {
    // FSSAI makes a "Contains" line mandatory, but the column is asked on no
    // screen today — so every live listing has an empty array. Blocking would
    // stop a maker editing a price until they answer a question nobody put to
    // them, which is exactly the bug this form just had with `ingredients`.
    for (const family of ["cooked", "baked", "jarred", "skin"] as const) {
      expect(asksFor(family, "allergens")).toBe(true);
      expect(requires(family, "allergens")).toBe(false);
    }
  });

  it("can tell 'no allergens' from 'never asked'", () => {
    expect(ALLERGEN_OPTIONS).toContain("Peanut");
    expect(ALLERGEN_OPTIONS).toContain("Milk");
    expect(ALLERGEN_OPTIONS).not.toContain(ALLERGEN_NONE);
    expect(ALLERGEN_NONE).toBeTruthy();
  });
});

describe("validation follows the family", () => {
  function values(patch: Partial<ListingFormValues>): ListingFormValues {
    return {
      ...EMPTY_LISTING_FORM,
      name: "A thing",
      categoryId: "c1",
      description: "Something somebody made.",
      weightRows: [{ label: "One", price: "200", mrp: "200", stock: "4" }],
      ...patch,
    };
  }

  it("stops requiring a shelf life from a cooked dish", () => {
    const errors = validateListingForm(
      values({ kind: "food", ingredients: "Rajma, onion, tomato", dietary: ["vegetarian"] }),
      "cooked",
    );
    expect(errors.shelfLife).toBeUndefined();
    expect(hasListingFormErrors(errors)).toBe(false);
  });

  it("still requires one from a jar", () => {
    const errors = validateListingForm(
      values({ kind: "food", ingredients: "Raw mango, mustard oil", dietary: ["vegetarian"] }),
      "jarred",
    );
    expect(errors.shelfLife).toBeDefined();
    expect(errors.shelfLife).not.toContain("must be");
  });

  it("requires a size from a piece of jewellery, and nothing about food", () => {
    const errors = validateListingForm(values({ kind: "craft" }), "worn");
    expect(errors.dimensions).toBeDefined();
    expect(errors.material).toBeDefined();
    expect(errors.ingredients).toBeUndefined();
    expect(errors.shelfLife).toBeUndefined();
  });

  it("requires ingredients from a bar of soap", () => {
    const errors = validateListingForm(values({ kind: "craft" }), "skin");
    expect(errors.ingredients).toBeDefined();
    // ...and asks it nothing about being vegetarian.
    expect(asksFor("skin", "dietary")).toBe(false);
  });

  it("blocks nothing extra on an unknown shelf", () => {
    const errors = validateListingForm(values({ kind: "craft" }), "general");
    expect(hasListingFormErrors(errors)).toBe(false);
  });

  /**
   * The gap this catches, found by writing it: `dietary` was declared
   * required by three families and checked by nothing. The form marked it
   * "Optional" and the save went through — a field that claims to block and
   * does not is the same fault as the one the banner had, one layer down.
   * Anything a family requires has to be refusable AND reachable, or "it is
   * marked on the form" is a sentence again rather than a fact.
   */
  it("every field a family requires is one the validator actually blocks on", () => {
    const blank = values({ kind: "food" });
    for (const family of Object.keys(FAMILY_FIELDS) as ListingFamily[]) {
      const errors = validateListingForm(blank, family);
      for (const field of FAMILY_FIELDS[family].required) {
        expect([family, field, errors[field as keyof typeof errors]]).toEqual([
          family,
          field,
          expect.any(String),
        ]);
        // And the jump can reach it.
        expect(LISTING_FIELD_ORDER).toContain(field);
      }
    }
  });

  it("a family that requires nothing refuses nothing extra", () => {
    expect(hasListingFormErrors(validateListingForm(values({ kind: "craft" }), "general"))).toBe(
      false,
    );
  });
});

/**
 * The sentinel is the only thing that lets an allergen list mean anything,
 * and it is also the one value that must never be rendered as written.
 */
describe("splitAllergens", () => {
  it("keeps 'none' out of the Contains line", () => {
    const { declared, saysNone } = splitAllergens([ALLERGEN_NONE]);
    expect(declared).toEqual([]);
    expect(saysNone).toBe(true);
    // The bug this exists to stop: a red "Contains None of these" chip.
    expect(declared).not.toContain(ALLERGEN_NONE);
  });

  it("tells silence from a declaration", () => {
    expect(splitAllergens([]).unanswered).toBe(true);
    expect(splitAllergens([]).saysNone).toBe(false);
    expect(splitAllergens(undefined).unanswered).toBe(true);
    expect(splitAllergens([ALLERGEN_NONE]).unanswered).toBe(false);
  });

  it("resolves a contradiction toward the allergen, never away from it", () => {
    // Somebody ticked Peanut and also "None of these". One reading is
    // unhelpful; the other reaches a person who reacts to peanuts.
    const { declared, saysNone } = splitAllergens([ALLERGEN_NONE, "Peanut"]);
    expect(declared).toEqual(["Peanut"]);
    expect(saysNone).toBe(false);
  });

  it("passes a plain declaration straight through", () => {
    expect(splitAllergens(["Milk", "Sesame"])).toEqual({
      declared: ["Milk", "Sesame"],
      saysNone: false,
      unanswered: false,
    });
  });
});
