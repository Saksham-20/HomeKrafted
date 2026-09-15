import type {
  DietaryTag,
  ProductKind,
  ProductShippingScope,
  ProductTag,
} from "@/lib/types";
import type { SellerListingInput } from "@/lib/api";
import { FAMILY_FIELDS, type ListingFamily } from "./listing-families";

export interface ListingFormWeightRow {
  /** Present once persisted; a freshly-added row has none yet — its sku is derived from the product name + label on save. */
  sku?: string;
  label: string;
  /**
   * Captured separately in the guided flow for craft listings (e.g.
   * "Rose gold", "Blue"). Merged into `label` on submission as
   * "Size · Colour". The full form does not show a separate column for
   * this — it is a guided-flow affordance that feeds the same pipe.
   */
  colour?: string;
  price: string;
  mrp: string;
  stock: string;
}

export interface ListingFormValues {
  name: string;
  categoryId: string;
  /**
   * Every other shelf this listing sits on (M58). The **primary** stays
   * `categoryId` — it is the breadcrumb and the canonical URL — and the
   * server folds it into the join, so this list is the extras only.
   */
  categoryIds: string[];
  occasionIds: string[];
  dietary: DietaryTag[];
  /**
   * How much notice this listing needs, as typed — a string like every
   * other numeric field in this form, so an empty box stays empty rather
   * than becoming a 0 the moment it is focused. `toSellerListingInput`
   * turns blank into `undefined`, never 0: 0 would be a claim that no
   * notice is needed, and the whole point of the column is that "not
   * stated" is a real answer. Same lesson as `parseStock` below, where a
   * blank turning into 0 took sixteen live listings off sale.
   */
  prepTimeMins: string;
  description: string;
  isPackaged: boolean;
  isHamper: boolean;
  /** M20 — which vertical this belongs to. Decides what the rest of the form asks. */
  kind: ProductKind;
  shippingScope: ProductShippingScope;
  isSnack: boolean;
  cashbackPct: string;
  tags: ProductTag[];
  imagePath: string;
  weightRows: ListingFormWeightRow[];
  defaultRowIndex: number;
  /** Physical size of a craft item — e.g. "15 × 10 × 5 cm". Only sent when kind = 'craft'. */
  dimensions: string;
  /** Primary material of a craft item — e.g. "100% Soy Wax". Only sent when kind = 'craft'. */
  material: string;
  /** Maintenance instructions — e.g. "Hand wash only". Only sent when kind = 'craft'. */
  careInstructions: string;
  ingredients: string;
  shelfLife: string;
  storageInstructions: string;
  allergens: string[];
  servingGuidance: string;
  fulfillmentType: "fresh_nearby" | "nationwide" | "gift_bulk";
}

export const EMPTY_LISTING_FORM: ListingFormValues = {
  name: "",
  categoryId: "",
  categoryIds: [],
  occasionIds: [],
  dietary: [],
  prepTimeMins: "",
  description: "",
  isPackaged: true,
  isHamper: false,
  kind: "food",
  shippingScope: "local",
  isSnack: false,
  cashbackPct: "5",
  tags: [],
  imagePath: "",
  weightRows: [{ label: "", colour: "", price: "", mrp: "", stock: "" }],
  defaultRowIndex: 0,
  dimensions: "",
  material: "",
  careInstructions: "",
  ingredients: "",
  shelfLife: "",
  storageInstructions: "",
  allergens: [],
  servingGuidance: "",
  fulfillmentType: "fresh_nearby",
};

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

/**
 * What a blank stock field means. The guided flow has always defaulted
 * a blank to this; the long form turned it into **0** — and 0 is "sold
 * out", so every listing saved here with the field left empty (an edit
 * opens this form, and so does the admin's on-behalf listing) could not
 * be added to a cart. Sixteen live listings were in that state on
 * 2026-09-03. A typed 0 is still 0: "sold out until next week" is a
 * real thing to say. Blank is not.
 */
export const DEFAULT_STOCK = 10;

/**
 * Blank means "not stated", and that is `undefined` — never 0.
 *
 * A 0 here would read as "no notice needed", which is a claim, and it is
 * the exact shape of the `parseStock` bug below: an empty box quietly
 * becoming a number that means something. A typed 0 is also `undefined`
 * rather than a stored zero, because "0 minutes of notice" is not a
 * thing anybody means to say — the honest way to say it is to leave the
 * box empty.
 */
export function parsePrepTime(raw: string): number | undefined {
  const trimmed = raw.trim();
  if (trimmed === "") return undefined;
  const n = Number(trimmed);
  if (!Number.isFinite(n) || n <= 0) return undefined;
  return Math.floor(n);
}

/**
 * The longest a derived SKU may be, mirroring `WeightOptionInputDto.sku`.
 *
 * Nobody types a SKU. It is built here as `slug(name)-slug(label)`, so a
 * legitimate long product name plus a legitimate long size produced a
 * string over 80 and the server refused the listing with
 * `weightOptions.0.sku must be shorter than or equal to 80 characters` —
 * a machine-generated identifier the maker has never seen, cannot find on
 * the form, and could not shorten if they wanted to.
 *
 * So a long SKU is **truncated, never refused**: see `deriveSku`. It is an
 * internal identifier, and the thing it must be is unique, not pretty.
 */
export const VARIANT_SKU_MAX = 80;

/**
 * The longest a variant label may be, mirroring
 * `server/src/seller/dto/create-listing.dto.ts`'s `WeightOptionInputDto`.
 *
 * Unlike the two identifier parsers (M17), this one is **exactly** the
 * server's number rather than deliberately looser. The reason is what the
 * value is for: an identifier parser only decides whether to enable a
 * button, so a false negative strands somebody at a dead control. This
 * decides whether a form can produce a payload the server will accept at
 * all — being looser here means the form keeps letting somebody build a
 * label that cannot be saved, which is the bug this exists to close. The
 * server stays the authority; this is the form refusing to offer an action
 * that cannot succeed.
 *
 * The limit is not arbitrary and must not be raised to make a long label
 * fit: the column is unbounded `String` in Postgres, but this label is
 * printed on the product card, in every cart row and on every order line,
 * and those are the layouts that break instead. `WeightOption.label` is
 * a size, not a description.
 */
export const VARIANT_LABEL_MAX = 40;

/**
 * How a size and a colour become one `WeightOption.label`.
 *
 * Extracted so the guided form, the full form and `toSellerListingInput`
 * all measure the same string. They did not: only the submit path built
 * the merged label, so the guided flow's colour swatches could be ticked
 * until the label was any length at all, and the maker learned about the
 * limit from the server, at the bottom of the form, as
 * `weightOptions.0.label must be shorter than or equal to 40 characters`.
 */
export function mergeVariantLabel(size: string, colour?: string): string {
  const trimmedColour = colour?.trim();
  const trimmedSize = size.trim();
  if (!trimmedColour) return trimmedSize;
  return trimmedSize ? `${trimmedSize} · ${trimmedColour}` : trimmedColour;
}

/**
 * The sentence a HomeKrafter should read, or `undefined` when the label is
 * fine. Names the thing they can see and change (the size and the colours),
 * never `weightOptions.0.label`, and says what to do about it.
 */
export function variantLabelError(size: string, colour?: string): string | undefined {
  const label = mergeVariantLabel(size, colour);
  if (label.length <= VARIANT_LABEL_MAX) return undefined;
  const over = label.length - VARIANT_LABEL_MAX;
  return `Size and colour together come to ${label.length} characters — ${over} too many. Shoppers see this on the product card, so it has to stay under ${VARIANT_LABEL_MAX}. Pick fewer colours here and add another option for the rest, or shorten the size.`;
}

/**
 * `slug(name)-slug(label)`, kept inside `VARIANT_SKU_MAX`.
 *
 * When it does not fit, the NAME is what gets cut and the label is kept
 * whole wherever possible: two sizes of one product differ only in the
 * label half, so truncating that half is what collides. A trailing hyphen
 * left by the cut is removed, and `index` disambiguates the pathological
 * case where two labels still slug identically after truncation.
 */
export function deriveSku(name: string, label: string, index = 0): string {
  const labelSlug = slugify(label);
  const nameSlug = slugify(name);

  // Both halves can slug to nothing — a name and a size of pure
  // punctuation or non-Latin script, which `slugify` strips entirely.
  // `${""}-${""}` is "-", which passes @MinLength(1) and then collides
  // with every other such listing on a @unique column. Checked before the
  // length test, because a one-character sku is short enough to slip past it.
  if (!nameSlug && !labelSlug) return `item-${index}`;
  if (!nameSlug) return labelSlug.slice(0, VARIANT_SKU_MAX);
  if (!labelSlug) return nameSlug.slice(0, VARIANT_SKU_MAX);

  const full = `${nameSlug}-${labelSlug}`;
  if (full.length <= VARIANT_SKU_MAX) return full;

  const suffix = labelSlug.slice(0, VARIANT_SKU_MAX - 2);
  const room = VARIANT_SKU_MAX - suffix.length - 1;
  const head = nameSlug.slice(0, Math.max(1, room)).replace(/-+$/, "");
  const candidate = `${head}-${suffix}`.slice(0, VARIANT_SKU_MAX).replace(/-+$/, "");
  if (candidate.length > 0) return candidate;
  // Nothing survived the slug (a name and label of pure punctuation).
  return `item-${index}`;
}

export function parseStock(raw: string): number {
  const trimmed = raw.trim();
  if (trimmed === "") return DEFAULT_STOCK;
  const n = Number(trimmed);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : DEFAULT_STOCK;
}

/** Builds the `lib/api/seller` mutation payload from form state, deriving each weight row's `sku` (stable for existing rows, freshly slugified for new ones) and `defaultWeightSku` from the marked default row. */
export function toSellerListingInput(values: ListingFormValues): SellerListingInput {
  const weightOptions = values.weightRows.map((row, index) => {
    // Colour, when present, is a guided-flow-only capture that merges into
    // the label — "Small · Rose gold" — keeping everything downstream
    // (cart, order, PDP) label-driven until the full ProductOption model
    // ships. See docs/CLIENT-CHANGES-2026-09.md § G.
    const mergedLabel = mergeVariantLabel(row.label, row.colour);
    return {
      // An existing row keeps its stored sku — it is on every past order
      // line and in every cart. Only a new row derives one.
      sku: row.sku ?? deriveSku(values.name, mergedLabel, index),
      label: mergedLabel,
      price: Number(row.price) || 0,
      mrp: Number(row.mrp) || 0,
      stock: parseStock(row.stock),
    };
  });

  return {
    name: values.name,
    categoryId: values.categoryId,
    categoryIds: values.categoryIds,
    occasionIds: values.occasionIds,
    // A craft has no dietary tags and is never a snack, whatever was ticked
    // before the kind was switched. Sending stale food fields on a candle
    // would put it on the snacks menu and label it vegan.
    dietary: values.kind === "craft" ? [] : values.dietary,
    prepTimeMins: parsePrepTime(values.prepTimeMins),
    description: values.description,
    isPackaged: values.isPackaged,
    isHamper: values.isHamper,
    kind: values.kind,
    // A gift is posted, never delivered by the maker nearby (owner,
    // 2026-09-15): a courier carries crafts and never food, so "local" on a
    // candle only hid it from every buyer outside the maker's radius. The
    // choice is asked of food alone; this is the rule for every editor.
    shippingScope: values.kind === "craft" ? "national" : values.shippingScope,
    isSnack: values.kind === "craft" ? false : values.isSnack,
    cashbackPct: Number(values.cashbackPct) || 0,
    tags: values.tags,
    imagePath: values.imagePath,
    weightOptions,
    defaultWeightSku: weightOptions[values.defaultRowIndex]?.sku ?? weightOptions[0]?.sku ?? "",
    // Dimensions, materials & care instructions — supported across all listings (food, crafts, gifts)
    dimensions: values.dimensions.trim() || undefined,
    material: values.material.trim() || undefined,
    careInstructions: values.careInstructions.trim() || undefined,
    ingredients: values.ingredients.trim() || undefined,
    shelfLife: values.shelfLife.trim() || undefined,
    storageInstructions: values.storageInstructions.trim() || undefined,
    allergens: values.allergens.length > 0 ? values.allergens : undefined,
    servingGuidance: values.servingGuidance.trim() || undefined,
  };
}

/**
 * What is missing before the form can be saved, keyed by field. The
 * editors compute it on a submit attempt and hand it back in, so the
 * refusal lands on the field rather than only in a sentence at the
 * bottom of a two-screen form.
 */
export interface ListingFormErrors {
  name?: string;
  categoryId?: string;
  description?: string;
  ingredients?: string;
  shelfLife?: string;
  dimensions?: string;
  material?: string;
  careInstructions?: string;
  storageInstructions?: string;
  servingGuidance?: string;
  prepTimeMins?: string;
  /** Index → message, for a tier the server would refuse. */
  weightRows?: Record<number, string>;
}

/**
 * Every limit the server enforces, in the maker's words.
 *
 * `server/src/seller/dto/create-listing.dto.ts` is the authority; this is
 * the mirror, and it exists because anything it misses reaches a home cook
 * as a `class-validator` sentence about a DTO property path. Two of those
 * shipped: `weightOptions.0.label` and `weightOptions.0.sku`, both shown at
 * the bottom of a finished form.
 *
 * Add a constraint to the DTO, add it here. `listing-input.spec.ts` reads
 * the DTO file and fails the build on a `@MaxLength` this table does not
 * carry, so the two cannot drift in silence.
 */
export const LISTING_LIMITS = {
  name: 120,
  categoryId: 64,
  description: 4000,
  dimensions: 120,
  material: 200,
  careInstructions: 500,
  ingredients: 1000,
  shelfLife: 200,
  storageInstructions: 500,
  servingGuidance: 200,
} as const;

/** Minutes of notice the server accepts — `@Max(43200)`, i.e. 30 days. */
export const PREP_TIME_MAX_MINS = 43200;

/**
 * The order the form asks these questions in, which is the order the first
 * error is looked for. It is a list rather than `Object.keys`, because key
 * order is not a promise and "jump to the first problem" has to mean the
 * first one the maker would reach reading downward.
 */
export const LISTING_FIELD_ORDER = [
  "name",
  "categoryId",
  "description",
  "weightRows",
  "prepTimeMins",
  "dimensions",
  "material",
  "careInstructions",
  "ingredients",
  "shelfLife",
  "storageInstructions",
  "servingGuidance",
] as const;

export type ListingFieldKey = (typeof LISTING_FIELD_ORDER)[number];

/**
 * The DOM id of a field, so a failed save can put the cursor in it.
 *
 * Stable strings, never indexes into a render: `Field` puts this id on the
 * control itself, so `getElementById` returns something focusable.
 */
export function listingFieldId(key: ListingFieldKey | string, row?: number): string {
  return row === undefined ? `listing-field-${key}` : `listing-field-weight-${row}`;
}

/** The first field with a problem, reading down the form. `undefined` when there is none. */
export function firstListingErrorId(errors: ListingFormErrors): string | undefined {
  for (const key of LISTING_FIELD_ORDER) {
    if (key === "weightRows") {
      const rows = errors.weightRows;
      if (rows) {
        const first = Object.keys(rows)
          .map(Number)
          .sort((a, b) => a - b)[0];
        if (first !== undefined) return listingFieldId("weightRows", first);
      }
      continue;
    }
    if (errors[key]) return listingFieldId(key);
  }
  return undefined;
}

/** "Shorten it by N" — the same sentence shape everywhere, never a field path. */
function tooLong(what: string, value: string, max: number): string | undefined {
  const length = value.trim().length;
  if (length <= max) return undefined;
  return `${what} is ${length} characters — ${length - max} too many. Shorten it to ${max} or fewer.`;
}

/**
 * What each conditional field is called when we have to refuse it, and the
 * sentence that says why it is worth answering. Both sides of the same
 * question: the refusal and the nudge should not disagree about what the
 * field is for.
 */
const FIELD_REFUSAL: Record<string, string> = {
  ingredients: "List what is in it — buyers with allergies read this before anything else.",
  allergens: "Tick anything it contains. Leaving it blank is not the same as saying none.",
  shelfLife: "How long does it keep? (e.g. 30 days unopened.)",
  dimensions: "Give the size. It is the first thing somebody asks and the commonest reason a gift is returned.",
  material: "What is it made of?",
};

export function validateListingForm(
  values: ListingFormValues,
  /**
   * What is being listed — which decides which questions block.
   *
   * Required, and deliberately not defaulted. A default would have been
   * `resolveFamily({ kind })`, i.e. `cooked`/`general`, and a caller that
   * simply had not been updated would then quietly validate a jar of pickle
   * against the rules for a thali — two screens editing the same listing
   * disagreeing about what it owes. `resolveFamily` never throws and never
   * returns undefined, so there is nothing for a caller to handle: it costs
   * one line and it is a compile error to forget.
   */
  family: ListingFamily,
): ListingFormErrors {
  const errors: ListingFormErrors = {};
  if (!values.name.trim()) errors.name = "Give it a name.";
  else errors.name = tooLong("The name", values.name, LISTING_LIMITS.name);
  if (!values.categoryId) errors.categoryId = "Pick the shelf it belongs on.";
  if (!values.description.trim()) errors.description = "A sentence or two is enough.";
  else errors.description = tooLong("The description", values.description, LISTING_LIMITS.description);

  // Notice: `@Max(43200)` on the server. A typo of 1200000 came back as
  // "prepTimeMins must not be greater than 43200", which is a number
  // nobody has been shown and a field name nobody can see.
  const prep = values.prepTimeMins.trim();
  if (prep !== "") {
    const minutes = Number(prep);
    if (!Number.isFinite(minutes) || minutes < 0) {
      errors.prepTimeMins = "Give the notice in whole minutes, or leave it blank.";
    } else if (minutes > PREP_TIME_MAX_MINS) {
      errors.prepTimeMins = `That is more than 30 days of notice. The most we can hold is ${PREP_TIME_MAX_MINS} minutes.`;
    }
  }

  errors.dimensions = tooLong("The size", values.dimensions, LISTING_LIMITS.dimensions);
  errors.material = tooLong("The material", values.material, LISTING_LIMITS.material);
  errors.careInstructions = tooLong("The care instructions", values.careInstructions, LISTING_LIMITS.careInstructions);
  errors.storageInstructions = tooLong("The storage instructions", values.storageInstructions, LISTING_LIMITS.storageInstructions);
  errors.servingGuidance = tooLong("The serving guidance", values.servingGuidance, LISTING_LIMITS.servingGuidance);

  /*
   * Which of the conditional questions are blocking depends on what is being
   * listed, not on the food/craft flag.
   *
   * The old rule was `kind === "food"` requires ingredients and shelf life —
   * which asked a thali for a shelf life it does not have, and asked a bar of
   * soap for nothing at all even though it goes on somebody's skin.
   */
  const required = new Set<string>(FAMILY_FIELDS[family].required);

  const blank = (value: string) => !value.trim();
  if (required.has("ingredients") && blank(values.ingredients)) {
    errors.ingredients = FIELD_REFUSAL.ingredients;
  } else {
    errors.ingredients = tooLong("The ingredients", values.ingredients, LISTING_LIMITS.ingredients);
  }
  if (required.has("shelfLife") && blank(values.shelfLife)) {
    errors.shelfLife = FIELD_REFUSAL.shelfLife;
  } else {
    errors.shelfLife = tooLong("The shelf life", values.shelfLife, LISTING_LIMITS.shelfLife);
  }
  if (required.has("dimensions") && blank(values.dimensions)) {
    errors.dimensions = FIELD_REFUSAL.dimensions;
  }
  if (required.has("material") && blank(values.material)) {
    errors.material = FIELD_REFUSAL.material;
  }
  values.weightRows.forEach((row, index) => {
    /*
     * Both checks measure what the server measures.
     *
     * The length one was missing entirely, and the guided flow merges the
     * colour swatches into this same string — so ticking a fifth colour
     * built a label the server refuses, and the only thing that ever said
     * so was the API, at the bottom of a finished form, as
     * "weightOptions.0.label must be shorter than or equal to 40
     * characters". A HomeKrafter cannot act on a DTO field path.
     */
    const problem = !row.label.trim()
      ? "Every size needs a label — “250 g”, “One”, “Box of 6”."
      : variantLabelError(row.label, row.colour);
    if (problem) {
      errors.weightRows = { ...(errors.weightRows ?? {}), [index]: problem };
    }
  });
  return errors;
}

/**
 * How many problems there are.
 *
 * Both save paths hand-counted four keys — name, category, description and
 * the size rows — so a form failing only on ingredients and shelf life
 * rendered the banner "**0 things are missing** — they are marked on the
 * form". Derived from the object now, so a new rule counts itself.
 */
export function countListingFormErrors(errors: ListingFormErrors): number {
  return Object.entries(errors).reduce((total, [key, value]) => {
    if (key === "weightRows") {
      return total + Object.keys((value as Record<number, string>) ?? {}).length;
    }
    return total + (value ? 1 : 0);
  }, 0);
}

/**
 * Any problem at all.
 *
 * Reads every key rather than a hand-written list: the previous version
 * enumerated five, so a constraint added to `validateListingForm` without
 * being added here would validate, render its message, and still let the
 * save through. `weightRows` counts only when it actually holds a row.
 */
export function hasListingFormErrors(errors: ListingFormErrors): boolean {
  return Object.entries(errors).some(([key, value]) =>
    key === "weightRows"
      ? Boolean(value) && Object.keys(value as Record<number, string>).length > 0
      : Boolean(value),
  );
}

