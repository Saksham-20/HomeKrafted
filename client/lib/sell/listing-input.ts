import type {
  DietaryTag,
  ProductKind,
  ProductShippingScope,
  ProductTag,
} from "@/lib/types";
import type { SellerListingInput } from "@/lib/api";

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

export function parseStock(raw: string): number {
  const trimmed = raw.trim();
  if (trimmed === "") return DEFAULT_STOCK;
  const n = Number(trimmed);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : DEFAULT_STOCK;
}

/** Builds the `lib/api/seller` mutation payload from form state, deriving each weight row's `sku` (stable for existing rows, freshly slugified for new ones) and `defaultWeightSku` from the marked default row. */
export function toSellerListingInput(values: ListingFormValues): SellerListingInput {
  const weightOptions = values.weightRows.map((row) => {
    // Colour, when present, is a guided-flow-only capture that merges into
    // the label — "Small · Rose gold" — keeping everything downstream
    // (cart, order, PDP) label-driven until the full ProductOption model
    // ships. See docs/CLIENT-CHANGES-2026-09.md § G.
    const colour = row.colour?.trim();
    const size = row.label.trim();
    const mergedLabel = colour ? (size ? `${size} · ${colour}` : colour) : size;
    return {
      sku: row.sku ?? `${slugify(values.name)}-${slugify(mergedLabel)}`,
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
    shippingScope: values.shippingScope,
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
  /** Index → message, for a tier with no size label. */
  weightRows?: Record<number, string>;
}

export function validateListingForm(values: ListingFormValues): ListingFormErrors {
  const errors: ListingFormErrors = {};
  if (!values.name.trim()) errors.name = "Give it a name.";
  if (!values.categoryId) errors.categoryId = "Pick the shelf it belongs on.";
  if (!values.description.trim()) errors.description = "A sentence or two is enough.";
  if (values.kind === "food") {
    if (!values.ingredients.trim()) {
      errors.ingredients = "List ingredients for food safety (e.g. flour, raw mango, mustard oil).";
    }
    if (!values.shelfLife.trim()) {
      errors.shelfLife = "State shelf life (e.g. 3 days refrigerated).";
    }
  }
  values.weightRows.forEach((row, index) => {
    if (!row.label.trim()) {
      errors.weightRows = { ...(errors.weightRows ?? {}), [index]: "Every size needs a label — “250 g”, “One”, “Box of 6”." };
    }
  });
  return errors;
}

export function hasListingFormErrors(errors: ListingFormErrors): boolean {
  return Boolean(
    errors.name ||
      errors.categoryId ||
      errors.description ||
      errors.ingredients ||
      errors.shelfLife ||
      errors.weightRows,
  );
}

