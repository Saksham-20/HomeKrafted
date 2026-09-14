import type { ProductKind } from "@/lib/types";

/**
 * What kind of thing is being listed, for the purpose of deciding what to
 * ask about it.
 *
 * Etsy serves a different attribute set per category node; Amazon gives each
 * product type its own schema and refuses a listing missing that type's
 * required fields. Both arrived at the same shape because one flat form
 * cannot ask a candle maker and a pickle kitchen the same questions without
 * being wrong for one of them. This form's only branch was
 * `kind === "craft"`, and it changed placeholder text.
 *
 * Six families, derived from `SellerSpecialty` and the live category tree.
 * Deliberately coarse: a family exists when it changes what we ASK, not
 * whenever two products differ. Splitting "earrings" from "necklaces" buys
 * nothing, because the questions are the same.
 */
export type ListingFamily =
  | "cooked"
  | "baked"
  | "jarred"
  | "worn"
  | "room"
  | "skin"
  | "general";

/**
 * Every question the form can ask beyond the universal four (name, photo,
 * price, category). A family names which of these it wants and at what
 * strength; anything unnamed is not rendered at all.
 *
 * Not `ListingFieldKey` — `listing-input.ts` already exports that name for
 * the form's field ORDER, which is a different list (it carries `name`,
 * `categoryId` and `weightRows`, and does not carry `allergens`). Two types
 * of one name in one import block is a trap, and `ListingForm.tsx` imports
 * from both files.
 */
export type FamilyFieldKey =
  | "ingredients"
  | "allergens"
  | "dietary"
  | "shelfLife"
  | "storageInstructions"
  | "servingGuidance"
  | "prepTimeMins"
  | "dimensions"
  | "material"
  | "careInstructions";

export interface FamilyFields {
  /** Save is blocked without these. */
  required: FamilyFieldKey[];
  /** Rendered and asked for, but never blocking. */
  encouraged: FamilyFieldKey[];
}

/**
 * Which questions each family gets.
 *
 * Required stays small on purpose. Conditional disclosure cuts perceived
 * form length by 20-40%, which is only true if what remains is short — a
 * family that requires eight things has just moved the wall, not removed it.
 * Everything else is `encouraged`: rendered, prompted, never blocking.
 */
/**
 * **Allergens are `encouraged`, not `required`, and that is deliberate.**
 *
 * FSSAI makes a "Contains" statement mandatory on pre-packaged food, so the
 * honest strength here is required. But the column is asked on no screen
 * today, which means every listing in the live catalogue carries an empty
 * array — and making it blocking would stop a HomeKrafter editing the price
 * of a listing they made months ago until they answered a question nobody
 * ever put to them. That is precisely the failure this form just had with
 * `ingredients` (4363698), and repeating it knowingly would be worse.
 *
 * So: asked on every food screen from now on, prompted, never blocking.
 * It becomes `required` for the food families once the live catalogue has
 * been backfilled — the same retroactive-gate rule M22 applies to
 * moderation status.
 *
 * **`dietary` is `encouraged` for the same reason and one more.** The veg
 * mark has a documented asymmetry: a wrong green mark reaches somebody who
 * would not have eaten it, so blank must keep meaning "we never asked"
 * rather than being squeezed out of a maker who is unsure. Requiring it
 * would make the fastest way past the block a guess, on the one field where
 * a guess is the failure. The form still asks for it first among the
 * encouraged questions.
 */
export const FAMILY_FIELDS: Record<ListingFamily, FamilyFields> = {
  /** A thali, a curry, a tiffin. Cooked after the order and eaten today. */
  cooked: {
    required: ["ingredients"],
    encouraged: ["dietary", "allergens", "servingGuidance", "prepTimeMins", "storageInstructions"],
  },

  /**
   * Cakes, cookies, mithai. Keeps for days rather than hours, so shelf life
   * is the question a buyer actually asks — and a custom cake is the case
   * `prepTimeMins` exists for.
   */
  baked: {
    required: ["ingredients"],
    encouraged: ["dietary", "allergens", "shelfLife", "storageInstructions", "servingGuidance", "prepTimeMins"],
  },

  /**
   * Pickle, chutney, namkeen, a bottled drink. Pre-packaged, which in India
   * is the line where FSSAI labelling attaches: ingredients in descending
   * order, a "Contains" allergen statement, net quantity, date marking and
   * the veg/non-veg mark. Shelf life and storage stop being nice-to-have.
   */
  jarred: {
    required: ["ingredients", "shelfLife"],
    encouraged: ["dietary", "allergens", "storageInstructions", "dimensions", "servingGuidance"],
  },

  /** Jewellery, textiles. Worn, so fit is the return reason. */
  worn: {
    required: ["dimensions", "material"],
    encouraged: ["careInstructions"],
  },

  /** Ceramics, candles, prints, decor. Goes in a room, so size is the question. */
  room: {
    required: ["dimensions"],
    encouraged: ["material", "careInstructions"],
  },

  /**
   * Soap, balm, bath salts. **This is where the food/craft binary breaks.**
   *
   * A bath-and-body maker is filed as `craft`, so the form has been hiding
   * the ingredient question from exactly the people whose product goes on
   * somebody's skin. Allergens matter here for the same reason they matter
   * in a kitchen, and neither was ever asked.
   */
  skin: {
    required: ["ingredients"],
    encouraged: ["allergens", "dimensions", "material", "shelfLife", "careInstructions"],
  },

  /**
   * We could not tell from the category what this is.
   *
   * Half the gift-side shelves are RECIPIENT shelves — `for-her`,
   * `for-kids`, `shop-by-recipient` — which say who it is for and nothing
   * about what it is. Guessing a family from those would ask a candle maker
   * about shelf life with more confidence than before, not less. So this
   * asks the craft basics and nothing it cannot justify.
   */
  general: {
    required: [],
    encouraged: ["dimensions", "material", "careInstructions"],
  },
};

/** Category slugs that name a kind of thing, grouped by the family they imply. */
const SLUG_FAMILY: Record<string, ListingFamily> = {
  // cooked
  punjabi: "cooked",
  gujarati: "cooked",
  bengali: "cooked",
  "south-indian": "cooked",
  "indo-chinese": "cooked",
  "street-food": "cooked",
  "shop-by-cuisine": "cooked",
  "shop-by-meal": "cooked",
  "sunday-specials": "cooked",
  combos: "cooked",

  // baked
  cookies: "baked",
  desserts: "baked",
  "cakes-and-desserts": "baked",
  "sweets-ladoos": "baked",

  // jarred
  pickles: "jarred",
  chutneys: "jarred",
  "dry-fruits": "jarred",
  "snacks-and-namkeen": "jarred",
  beverages: "jarred",

  // worn
  earrings: "worn",
  rings: "worn",
  necklaces: "worn",
  bracelets: "worn",
  textiles: "worn",

  // room
  "home-decor": "room",
  ceramics: "room",
  "scented-candles": "room",
  "wall-art": "room",
  "prints-and-posters": "room",
  "art-prints": "room",
  "custom-prints": "room",
  crochet: "room",
  flowers: "room",
};

/**
 * Slugs that describe WHO a gift is for, not what it is.
 *
 * Named rather than inferred, so the resolver can say "I cannot tell" out
 * loud instead of reading `for-her` as a product type.
 */
const RECIPIENT_SLUGS = new Set([
  "for-her",
  "for-him",
  "for-kids",
  "for-parents",
  "for-couples",
  "for-colleagues",
  "shop-by-recipient",
  "festive-gifts",
]);

/** Slugs whose products are made to the buyer's instruction. */
const PERSONALISED_SLUGS = new Set([
  "personalised-gifts",
  "engraved",
  "name-and-initial",
  "custom-prints",
]);

export interface FamilyInput {
  kind: ProductKind;
  /** The slug of the primary category, when one has been chosen. */
  categorySlug?: string;
  /** The maker's own specialties, as the tiebreak when the category cannot say. */
  specialties?: readonly string[];
}

/**
 * Which family this listing belongs to.
 *
 * Order matters and is deliberate: the category the maker picked for THIS
 * listing beats the specialties on their account, because one kitchen can
 * sell both a thali and a jar of pickle and the account-level tag cannot
 * tell those apart. Specialties are the fallback, and `kind` is the floor.
 *
 * Never throws and never returns undefined — an unknown slug resolves to
 * `general`, which asks less rather than guessing more.
 */
export function resolveFamily({ kind, categorySlug, specialties }: FamilyInput): ListingFamily {
  // A slug we know names a kind of thing. A recipient shelf (`for-her`) and
  // an unrecognised one (a shelf an admin added since this map was written)
  // both fall through to the weaker signals rather than being read as a
  // product type — RECIPIENT_SLUGS exists to document that this is a
  // decision, not an oversight.
  const bySlug = categorySlug ? SLUG_FAMILY[categorySlug] : undefined;
  if (bySlug) return bySlug;

  if (specialties?.length) {
    if (specialties.includes("bath_body")) return "skin";
    if (specialties.includes("bakery") || specialties.includes("sweets")) return "baked";
    if (specialties.includes("pickles_preserves") || specialties.includes("snacks") || specialties.includes("beverages")) {
      return "jarred";
    }
    if (specialties.includes("homemade_food")) return "cooked";
    if (specialties.includes("jewellery") || specialties.includes("textiles")) return "worn";
    if (specialties.includes("ceramics") || specialties.includes("candles") || specialties.includes("home_decor") || specialties.includes("art_prints") || specialties.includes("stationery")) {
      return "room";
    }
  }

  // The floor. Food we have nothing else on is treated as cooked, which is
  // the commonest case and the one whose required set is about safety.
  return kind === "food" ? "cooked" : "general";
}

/**
 * True when the chosen shelf says who a gift is FOR rather than what it is.
 *
 * The form uses this to explain itself: on a recipient shelf it can only ask
 * the general questions, and saying so beats silently asking fewer. It is
 * also the signal that this listing would benefit from a second, product-type
 * shelf (M58 lets a listing sit on several).
 */
export function isRecipientShelf(categorySlug?: string): boolean {
  return Boolean(categorySlug && RECIPIENT_SLUGS.has(categorySlug));
}

/** Whether this listing is made to the buyer's instruction. */
export function isPersonalisedListing(categorySlug?: string): boolean {
  return Boolean(categorySlug && PERSONALISED_SLUGS.has(categorySlug));
}

/** Does this family want this question at all? */
export function asksFor(family: ListingFamily, field: FamilyFieldKey): boolean {
  const fields = FAMILY_FIELDS[family];
  return fields.required.includes(field) || fields.encouraged.includes(field);
}

/** Is it blocking? */
export function requires(family: ListingFamily, field: FamilyFieldKey): boolean {
  return FAMILY_FIELDS[family].required.includes(field);
}

/**
 * The eight FSSAI names, plus the two that matter most in Indian home
 * kitchens and are not on the statutory list.
 *
 * "None of these" is an option on purpose: without it, blank means both "no
 * allergens" and "never asked", and those are not the same claim. It is the
 * same asymmetry the veg mark has — a wrong "none" reaches somebody with an
 * allergy, so the form must be able to tell silence from an answer.
 */
export const ALLERGEN_OPTIONS = [
  "Milk",
  "Egg",
  "Peanut",
  "Tree nuts",
  "Soy",
  "Wheat / gluten",
  "Fish",
  "Shellfish",
  "Sesame",
  "Mustard",
] as const;

/** The explicit "nothing from that list" answer. Stored like any other value. */
export const ALLERGEN_NONE = "None of these";

/**
 * Split a stored allergen list into what a buyer should be shown.
 *
 * The sentinel is stored like any other value, which is what lets the
 * column distinguish a declaration from silence — and it is exactly why it
 * must never reach a `Contains ___` line, where it would render as
 * "Contains None of these": a red warning chip saying the opposite of what
 * the maker answered.
 *
 * `unanswered` is the third state and the commonest one: every row written
 * before the form asked. Nothing may render it as a safety claim in either
 * direction.
 */
export function splitAllergens(allergens: readonly string[] | undefined): {
  declared: string[];
  saysNone: boolean;
  unanswered: boolean;
} {
  const list = allergens ?? [];
  const declared = list.filter((a) => a !== ALLERGEN_NONE);
  return {
    declared,
    // A list holding both the sentinel and a real allergen is contradictory
    // input. It resolves to the allergens, never to "none" — the same
    // asymmetry the veg mark has, and for the same reason: one direction is
    // unhelpful and the other reaches somebody who reacts to it.
    saysNone: list.includes(ALLERGEN_NONE) && declared.length === 0,
    unanswered: list.length === 0,
  };
}
