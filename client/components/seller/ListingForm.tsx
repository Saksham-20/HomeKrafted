"use client";

import { useMemo } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Chip } from "@/components/ui/Chip";
import { Combobox } from "@/components/ui/Combobox";
import { ImageUpload } from "@/components/ui/ImageUpload";
import { ChoiceCards } from "@/components/portal/ChoiceCards";
import { CheckRow, ChipRow, Field, FieldGrid, Fieldset, Input, TextArea } from "@/components/portal/Field";
import { FormSection } from "@/components/portal/FormSection";
import type { DietaryTag, ProductKind, ProductShippingScope, ProductTag, SellerCommission } from "@/lib/types";
import type { SellerListingInput } from "@/lib/api";
import { commissionBreakdown, priceForTarget } from "@/lib/commission";
import { parentForSuggestion } from "@/lib/taxonomy-actions";
import type { ListingTaxonomyActions } from "@/lib/taxonomy-actions";
import { formatCurrency } from "@/lib/format";
import styles from "./ListingForm.module.css";

export interface ListingFormWeightRow {
  /** Present once persisted; a freshly-added row has none yet — its sku is derived from the product name + label on save. */
  sku?: string;
  label: string;
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
}

export const EMPTY_LISTING_FORM: ListingFormValues = {
  name: "",
  categoryId: "",
  categoryIds: [],
  occasionIds: [],
  dietary: [],
  description: "",
  isPackaged: true,
  isHamper: false,
  kind: "food",
  shippingScope: "local",
  isSnack: false,
  cashbackPct: "5",
  tags: [],
  imagePath: "",
  weightRows: [{ label: "", price: "", mrp: "", stock: "" }],
  defaultRowIndex: 0,
};

const DIETARY_OPTIONS: { value: DietaryTag; label: string }[] = [
  { value: "vegetarian", label: "Vegetarian" },
  { value: "vegan", label: "Vegan" },
  { value: "gluten-free", label: "Gluten-free" },
  { value: "sugar-free", label: "Sugar-free" },
  { value: "contains-nuts", label: "Contains nuts" },
];

const TAG_OPTIONS: ProductTag[] = ["Bestseller", "New", "Festive", "Curated"];

/**
 * The long form's sections, for a page's jump-nav. Exported so the
 * editor screens (seller and admin) list the same anchors this form
 * renders. `dietary` only exists for food, which the caller filters.
 */
export const LISTING_FORM_SECTIONS = [
  { id: "listing-photo", label: "Photo" },
  { id: "listing-kind", label: "What it is" },
  { id: "listing-basics", label: "Name & description" },
  { id: "listing-prices", label: "Sizes & prices" },
  { id: "listing-details", label: "Details & tags" },
] as const;

function slugify(value: string): string {
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

export function parseStock(raw: string): number {
  const trimmed = raw.trim();
  if (trimmed === "") return DEFAULT_STOCK;
  const n = Number(trimmed);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : DEFAULT_STOCK;
}

/** Builds the `lib/api/seller` mutation payload from form state, deriving each weight row's `sku` (stable for existing rows, freshly slugified for new ones) and `defaultWeightSku` from the marked default row. */
export function toSellerListingInput(values: ListingFormValues): SellerListingInput {
  const weightOptions = values.weightRows.map((row) => ({
    sku: row.sku ?? `${slugify(values.name)}-${slugify(row.label)}`,
    label: row.label,
    price: Number(row.price) || 0,
    mrp: Number(row.mrp) || 0,
    stock: parseStock(row.stock),
  }));

  return {
    name: values.name,
    categoryId: values.categoryId,
    categoryIds: values.categoryIds,
    occasionIds: values.occasionIds,
    // A craft has no dietary tags and is never a snack, whatever was ticked
    // before the kind was switched. Sending stale food fields on a candle
    // would put it on the snacks menu and label it vegan.
    dietary: values.kind === "craft" ? [] : values.dietary,
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
  /** Index → message, for a tier with no size label. */
  weightRows?: Record<number, string>;
}

export function validateListingForm(values: ListingFormValues): ListingFormErrors {
  const errors: ListingFormErrors = {};
  if (!values.name.trim()) errors.name = "Give it a name.";
  if (!values.categoryId) errors.categoryId = "Pick the shelf it belongs on.";
  if (!values.description.trim()) errors.description = "A sentence or two is enough.";
  values.weightRows.forEach((row, index) => {
    if (!row.label.trim()) {
      errors.weightRows = { ...(errors.weightRows ?? {}), [index]: "Every size needs a label — “250 g”, “One”, “Box of 6”." };
    }
  });
  return errors;
}

export function hasListingFormErrors(errors: ListingFormErrors): boolean {
  return Boolean(errors.name || errors.categoryId || errors.description || errors.weightRows);
}

export interface ListingFormProps {
  values: ListingFormValues;
  onChange: (values: ListingFormValues) => void;
  /** `group` absent reads as `"food"` — every category predating M20 was. */
  categories: { id: string; name: string; group?: ProductKind; parentId?: string | null }[];
  occasions: { id: string; name: string }[];
  /**
   * What to do when the shelf or occasion somebody wants is not on the
   * list (M50). Absent means the pickers are pick-only, which is what
   * every call site did before. See `lib/taxonomy-actions.ts` for why an
   * admin creates and a HomeKrafter asks.
   */
  taxonomy?: ListingTaxonomyActions;
  /**
   * The platform rate from `GET /seller/me` (M37) — drives the "you
   * receive ₹N" line under the price tiers. Omitted by the admin editor,
   * which is pricing on a kitchen's behalf and shows no earnings line.
   */
  commission?: SellerCommission;
  /** Per-field refusals from the last submit attempt. */
  errors?: ListingFormErrors;
}

/**
 * Shared create/edit form for a maker's `Product` — covers the real
 * schema (name, category, occasions, dietary, description, multi-tier
 * `weightOptions`, tags, photo). Both `/seller/listings/[id]` and the
 * admin editor render this and only differ in how they submit.
 *
 * Rebuilt on the shared portal kit (2026-09-04): five titled sections
 * on cards, photo first (the M45 finding — it is the one thing somebody
 * in a kitchen can produce immediately, and it is what sells), the two
 * decisions that change the rest of the form as choice cards with their
 * consequences written on them, and the price table with words in its
 * headings instead of "Def." and "MRP". Per-field errors arrive through
 * `errors` so a refusal lands where it can be fixed.
 */
export function ListingForm({
  values,
  onChange,
  categories,
  occasions,
  commission,
  taxonomy,
  errors,
}: ListingFormProps) {
  const occasionOptions = useMemo(
    () => occasions.map((o) => ({ value: o.id, label: o.name })),
    [occasions],
  );

  function set<K extends keyof ListingFormValues>(key: K, value: ListingFormValues[K]) {
    onChange({ ...values, [key]: value });
  }

  function toggleDietary(tag: DietaryTag) {
    set(
      "dietary",
      values.dietary.includes(tag) ? values.dietary.filter((d) => d !== tag) : [...values.dietary, tag],
    );
  }

  function toggleTag(tag: ProductTag) {
    set("tags", values.tags.includes(tag) ? values.tags.filter((t) => t !== tag) : [...values.tags, tag]);
  }

  function updateRow(index: number, patch: Partial<ListingFormWeightRow>) {
    const rows = values.weightRows.map((row, i) => (i === index ? { ...row, ...patch } : row));
    onChange({ ...values, weightRows: rows });
  }

  function addRow() {
    onChange({
      ...values,
      weightRows: [...values.weightRows, { label: "", price: "", mrp: "", stock: "" }],
    });
  }

  function removeRow(index: number) {
    const rows = values.weightRows.filter((_, i) => i !== index);
    const defaultRowIndex =
      values.defaultRowIndex >= rows.length ? Math.max(0, rows.length - 1) : values.defaultRowIndex;
    onChange({ ...values, weightRows: rows.length > 0 ? rows : values.weightRows, defaultRowIndex });
  }

  const isCraft = values.kind === "craft";
  const categoriesForKind = categories.filter((c) => (c.group ?? "food") === values.kind);
  /**
   * Subcategories are labelled with their parent — "Shop by meal ›
   * Breakfast" (M58).
   *
   * The combobox is a flat searchable list, so two shelves called
   * "Sweets" under different parents are indistinguishable without this,
   * and typing "breakfast" should find it whether or not the person knows
   * which group it lives in. A parent stays listed on its own: it is
   * browsable, showing the union of its children.
   */
  const categoryOptions = useMemo(() => {
    const nameById = new Map(categories.map((c) => [c.id, c.name]));
    return categoriesForKind.map((c) => {
      const parentName = c.parentId ? nameById.get(c.parentId) : undefined;
      return { value: c.id, label: parentName ? `${parentName} › ${c.name}` : c.name };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- rebuilt from the same `categories` prop and `values.kind` each render
  }, [categories, values.kind]);

  /** The primary is chosen in its own box, so it is never offered twice. */
  const extraCategoryOptions = useMemo(
    () => categoryOptions.filter((o) => o.value !== values.categoryId),
    [categoryOptions, values.categoryId],
  );

  // Earnings line inputs (M37): the default tier is the price on the
  // product card, so that is the one the line explains.
  const defaultRowPrice = Number(values.weightRows[values.defaultRowIndex]?.price) || 0;
  const breakdown = commissionBreakdown(defaultRowPrice, commission?.pct ?? 0);

  /**
   * Switching kind can strand the chosen category on the other side of the
   * catalogue, where the picker no longer lists it — leaving a value set
   * that nothing displays. Clearing it makes the empty picker honest.
   */
  function setKind(kind: ProductKind) {
    const stillValid = categories.some(
      (c) => c.id === values.categoryId && (c.group ?? "food") === kind,
    );
    // The extras can strand on the other side of the catalogue just as
    // the primary can, and an invisible value that still posts is worse
    // than an empty box.
    const keptExtras = values.categoryIds.filter((id) =>
      categories.some((c) => c.id === id && (c.group ?? "food") === kind),
    );
    onChange({
      ...values,
      kind,
      categoryId: stillValid ? values.categoryId : "",
      categoryIds: keptExtras,
    });
  }

  return (
    <div className={styles.form}>
      <FormSection
        id="listing-photo"
        title="Photo"
        description="One clear photo, taken on your phone in daylight, on a plain surface. It is the thing that decides whether somebody stops scrolling."
      >
        <ImageUpload
          label="Product photo"
          purpose="listing"
          ratio="1/1"
          placeholderLabel={values.name || "Product photo"}
          hint="You can save without one and add it later — but a listing without a photo sells far less."
          value={values.imagePath}
          onChange={(url) => set("imagePath", url)}
        />
      </FormSection>

      {/*
        First of the questions, because it decides what the rest of the
        form asks. A jeweller must not be asked whether their earrings are
        gluten-free, and the M20 note in the plan is explicit that the
        FSSAI badge is food-specific.
      */}
      <FormSection
        id="listing-kind"
        title="What is it, and how does it travel?"
        description="These two decide where the listing appears and who can see it."
      >
        <Fieldset legend="What are you listing?">
          <ChoiceCards
            label="What are you listing?"
            value={values.kind}
            onChange={setKind}
            options={[
              {
                value: "food",
                title: "Homemade food",
                hint: "Appears in the main shop, and can also go on your snacks menu.",
              },
              {
                value: "craft",
                title: "Handcrafted gift",
                hint: "Appears on the Gifts page. No ingredient or dietary questions.",
              },
            ]}
          />
        </Fieldset>
        {/*
          This is the field that decides whether a buyer 300km away can see
          the listing at all — `national` skips the delivery-radius filter
          entirely. It is asked separately from the kind on purpose: a
          kitchen posting pickles across India is a real case, and deriving
          this from "is it food" would forbid it.
        */}
        <Fieldset legend="How does it reach the buyer?">
          <ChoiceCards
            label="How does it reach the buyer?"
            value={values.shippingScope}
            onChange={(next) => set("shippingScope", next)}
            options={[
              {
                value: "local",
                title: "I deliver locally",
                hint: "Only shoppers inside your delivery distance see it — right for anything eaten fresh.",
              },
              {
                value: "national",
                title: "I post it anywhere in India",
                hint: "Shoppers across India see it. Only if you can genuinely pack and post it — a jar of pickle, not a hot meal.",
              },
            ]}
          />
        </Fieldset>
      </FormSection>

      <FormSection id="listing-basics" title="Name, shelf and description">
        <Field label="Product name" error={errors?.name}>
          <Input
            value={values.name}
            onChange={(event) => set("name", event.target.value)}
            placeholder="e.g. Mango Thokku Pickle"
          />
        </Field>
        <FieldGrid>
          {/*
            A searchable picker rather than a `<select>` (M50). Two
            reasons, and the second is the one that mattered: the list
            grows every time a shelf is added, and a `<select>` has
            nothing to type into — but more importantly a `<select>` has
            no way to say *"none of these is what I make"*. Now it has.

            Only the categories on this side of the catalogue. Pickles is
            not a shelf a candle can be on, and offering it is how a
            listing ends up filed somewhere no buyer will look — which is
            also why the ask carries `values.kind` rather than leaving an
            admin to guess at review time.
          */}
          <Field label="Category" error={errors?.categoryId} labelAsText>
            <Combobox
              label="Category"
              hideLabel
              value={values.categoryId ? [values.categoryId] : []}
              onChange={(next) => set("categoryId", next[0] ?? "")}
              options={categoryOptions}
              placeholder="Search shelves…"
              emptyMessage="Nothing by that name — try a shorter word."
              onSuggest={
                taxonomy?.suggestCategory
                  ? (name) =>
                      taxonomy.suggestCategory!(
                        name,
                        values.kind,
                        // File it beside whatever they already picked (M58).
                        parentForSuggestion(categories, values.categoryId),
                      )
                  : undefined
              }
              createNoun="shelf"
            />
          </Field>
          {/*
            M58 — a listing can sit on more than one shelf. A jar of pickle
            that is both "Pickles" and "Shop by meal › Breakfast" should be
            findable from either, and before this a HomeKrafter had to pick
            one and lose the other.

            Deliberately a *second* box rather than making the first one
            multi-select: the primary decides the breadcrumb and the
            canonical URL, so "which one is the main shelf" has to stay an
            answerable question.
          */}
          <Field label="Also show it under" optional labelAsText>
            <Combobox
              label="Also show it under"
              hideLabel
              value={values.categoryIds}
              onChange={(next) => set("categoryIds", next)}
              options={extraCategoryOptions}
              placeholder="Pick any that fit"
              emptyMessage="Nothing by that name — try a shorter word."
              multiple
            />
          </Field>
        </FieldGrid>
        {/*
          The "Cashback %" box used to be here, and it was a promise
          nothing kept (M46). Whatever a HomeKrafter typed was quoted on
          the product page as "earn ₹N wallet cashback" while the
          checkout credited a **flat platform rate on the whole
          subtotal** — so a listing set to 20% advertised four times what
          the buyer actually received, on the screen where they decide to
          buy.

          The column and the payload field stay, so existing values
          round-trip and no native client breaks; it is simply no longer
          asked for or quoted as money. A HomeKrafter who wants to give
          buyers something now has a real lever: their own storefront
          sale, on `/seller/storefront`.
        */}
        <Field
          label="Description"
          error={errors?.description}
          hint="What makes it worth buying — ingredients, process, story."
        >
          <TextArea
            rows={4}
            autoGrow
            value={values.description}
            onChange={(event) => set("description", event.target.value)}
            placeholder="Slow-cooked strips of raw mango in cold-pressed sesame oil…"
          />
        </Field>
      </FormSection>

      <FormSection
        id="listing-prices"
        title="Sizes and prices"
        description="One row per size you sell. The default row is the price shown on the product card. Leave stock blank for a sensible default; type 0 to show it as sold out."
      >
        <div className={styles.weightTable} role="group" aria-label="Sizes and prices">
          <div className={styles.weightHeadRow} aria-hidden="true">
            <span className={styles.weightHead}>Default</span>
            <span className={styles.weightHead}>Size</span>
            <span className={styles.weightHead}>Price</span>
            <span className={styles.weightHead}>Was (MRP)</span>
            <span className={styles.weightHead}>Stock</span>
            <span />
          </div>
          {values.weightRows.map((row, index) => (
            <div key={index} className={styles.weightRow}>
              <label className={styles.defaultCell}>
                <input
                  type="radio"
                  name="defaultWeightRow"
                  className={styles.defaultRadio}
                  checked={values.defaultRowIndex === index}
                  onChange={() => set("defaultRowIndex", index)}
                  aria-label={`Make "${row.label || `size ${index + 1}`}" the default`}
                />
                <span className={styles.cellLabel}>Default</span>
              </label>
              <Field label="Size" className={styles.cell} error={errors?.weightRows?.[index]}>
                <Input
                  dense
                  placeholder="250 g"
                  value={row.label}
                  onChange={(event) => updateRow(index, { label: event.target.value })}
                />
              </Field>
              <Field label="Price" className={styles.cell}>
                <Input
                  dense
                  type="number"
                  min={0}
                  inputMode="decimal"
                  affixStart="₹"
                  placeholder="0"
                  value={row.price}
                  onChange={(event) => updateRow(index, { price: event.target.value })}
                />
              </Field>
              <Field label="Was (MRP)" className={styles.cell}>
                <Input
                  dense
                  type="number"
                  min={0}
                  inputMode="decimal"
                  affixStart="₹"
                  placeholder="0"
                  value={row.mrp}
                  onChange={(event) => updateRow(index, { mrp: event.target.value })}
                />
              </Field>
              <Field label="Stock" className={styles.cell}>
                <Input
                  dense
                  type="number"
                  min={0}
                  inputMode="numeric"
                  placeholder={String(DEFAULT_STOCK)}
                  value={row.stock}
                  onChange={(event) => updateRow(index, { stock: event.target.value })}
                />
              </Field>
              <button
                type="button"
                className={styles.removeRowButton}
                onClick={() => removeRow(index)}
                disabled={values.weightRows.length <= 1}
                aria-label={`Remove size ${row.label || index + 1}`}
              >
                <Trash2 size={14} strokeWidth={1.8} aria-hidden="true" />
              </button>
            </div>
          ))}
        </div>
        <button type="button" className={styles.addRowButton} onClick={addRow}>
          <Plus size={15} strokeWidth={2} aria-hidden="true" />
          Add another size
        </button>
        {/*
          The M37 earnings line: what the default tier's price works out
          to after the platform's cut, at the server-supplied rate — never
          a hardcoded percentage. Hidden when no rate rides in (the admin
          editor) or no price is typed yet.
        */}
        {commission && defaultRowPrice > 0 ? (
          <p className={styles.earnings} aria-live="polite">
            Customer pays {formatCurrency(breakdown.gross)} → commission ({commission.pct}%){" "}
            {formatCurrency(breakdown.commission)} → you receive {formatCurrency(breakdown.net)}.
            {commission.enabled ? "" : " Estimate — nothing is deducted yet."}
            {commission.pct > 0 ? (
              <>
                {" "}To take home {formatCurrency(breakdown.gross)}, price at{" "}
                {formatCurrency(priceForTarget(breakdown.gross, commission.pct))}.
              </>
            ) : null}
          </p>
        ) : null}
      </FormSection>

      <FormSection
        id="listing-details"
        title="Details and tags"
        description="Everything here is optional. It helps the right buyer find the listing and tells them what to expect."
      >
        {/*
          A wall of chips (M43): fine at eleven occasions, unusable at
          thirty, and there was nothing to type into. A searchable picker
          replaces it — same selection, findable by name.

          **A HomeKrafter still cannot create one, and that has not
          changed.** Occasions are a shared vocabulary the whole catalogue
          browses by; one anybody can add to stops being one, and "Diwali",
          "diwali" and "Deepavali" become three hub pages splitting a
          festival's traffic. What M50 added is the missing other half: the
          picker used to say "ask an admin" with no way to, so `onSuggest`
          files the ask and an admin mints the row. An admin's own copy of
          this form gets `onCreate` instead. The gate is the server — the
          create route lives under `/api/v1/admin` — not which prop is
          passed.
        */}
        <Field
          label="Occasions this suits"
          optional
          labelAsText
          hint="Puts the listing on each occasion's page."
          className={styles.occasionPicker}
        >
          <Combobox
            label="Occasions this suits"
            hideLabel
            multiple
            placeholder="Search occasions…"
            value={values.occasionIds}
            onChange={(next) => set("occasionIds", next)}
            options={occasionOptions}
            emptyMessage="No occasion by that name."
            onCreate={taxonomy?.createOccasion}
            onSuggest={taxonomy?.suggestOccasion}
            createNoun="occasion"
          />
        </Field>

        {/* Food only. A candle has no dietary tags, and asking reads as a
            form that doesn't know what it's selling. */}
        {!isCraft && (
          <Fieldset legend="Dietary" optional>
            <ChipRow>
              {DIETARY_OPTIONS.map((option) => (
                <Chip
                  key={option.value}
                  label={option.label}
                  selected={values.dietary.includes(option.value)}
                  onClick={() => toggleDietary(option.value)}
                />
              ))}
            </ChipRow>
          </Fieldset>
        )}

        <Fieldset legend="Tags" optional>
          <ChipRow>
            {TAG_OPTIONS.map((tag) => (
              <Chip key={tag} label={tag} selected={values.tags.includes(tag)} onClick={() => toggleTag(tag)} />
            ))}
          </ChipRow>
        </Fieldset>

        <div className={styles.options}>
          <CheckRow
            label={isCraft ? "Ready to ship" : "Ready-to-ship, packaged"}
            help={
              isCraft
                ? "Untick if each piece is made to order after somebody buys it."
                : "Untick if you cook it to order — buyers are then offered your preparation time."
            }
            checked={values.isPackaged}
            onChange={(event) => set("isPackaged", event.target.checked)}
          />
          {!isCraft && (
            <CheckRow
              label="Also list it on my snacks menu"
              help="Snacks are ordered over WhatsApp rather than checked out on the site. It stays in the main shop either way."
              checked={values.isSnack}
              onChange={(event) => set("isSnack", event.target.checked)}
            />
          )}
          <CheckRow
            label="This is a ready-made gift hamper"
            help="Also lists it on the Gift hampers page. It stays in the main shop either way — a hamper is a listing like any other, priced and packed by you."
            checked={values.isHamper}
            onChange={(event) => set("isHamper", event.target.checked)}
          />
        </div>
      </FormSection>
    </div>
  );
}
