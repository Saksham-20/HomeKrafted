"use client";

import { useMemo } from "react";
import clsx from "clsx";
import { Plus, Trash2 } from "lucide-react";
import { Chip } from "@/components/ui/Chip";
import { Combobox } from "@/components/ui/Combobox";
import { ImageUpload } from "@/components/ui/ImageUpload";
import { ChoiceCards } from "@/components/portal/ChoiceCards";
import { CheckRow, ChipRow, Field, FieldGrid, Fieldset, Input, TextArea } from "@/components/portal/Field";
import { FormSection } from "@/components/portal/FormSection";
import type { DietaryTag, ProductKind, ProductTag, SellerCommission } from "@/lib/types";
import { markupBreakdown, type CommissionRate } from "@/lib/commission";
import {
  ALLERGEN_NONE,
  ALLERGEN_OPTIONS,
  FAMILY_FIELDS,
  isRecipientShelf,
  resolveFamily,
  type FamilyFieldKey,
} from "@/lib/sell/listing-families";
import { Notice } from "@/components/portal/Notice";
import { ColourSwatches } from "./ColourSwatches";
import { parentForSuggestion } from "@/lib/taxonomy-actions";
import type { ListingTaxonomyActions } from "@/lib/taxonomy-actions";
import { formatCurrency } from "@/lib/format";
import { PRE_ORDER_THRESHOLD_MINS } from "@/lib/pre-order";
import styles from "./ListingForm.module.css";

import {
  type ListingFormValues,
  type ListingFormWeightRow,
  type ListingFormErrors,
  listingFieldId,
  DEFAULT_STOCK,
  LISTING_LIMITS,
} from "@/lib/sell/listing-input";
export * from "@/lib/sell/listing-input";

/**
 * The veg/non-veg question, asked on its own and answered exactly once
 * (2026-09-05).
 */
const DIET_MARK_OPTIONS: { value: DietaryTag; label: string }[] = [
  { value: "vegetarian", label: "Veg" },
  { value: "non-vegetarian", label: "Non-veg" },
];

const DIETARY_OPTIONS: { value: DietaryTag; label: string }[] = [
  { value: "vegan", label: "Vegan" },
  { value: "contains-egg", label: "Contains egg" },
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
  { id: "listing-basics", label: "Name & description" },
  { id: "listing-prices", label: "Sizes & prices" },
  { id: "listing-details", label: "Details & tags" },
] as const;

export interface ListingFormProps {
  values: ListingFormValues;
  onChange: (values: ListingFormValues) => void;
  /** `group` absent reads as `"food"` — every category predating M20 was. */
  categories: { id: string; name: string; slug?: string; group?: ProductKind; parentId?: string | null }[];
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

  /**
   * "None of these" and a named allergen are mutually exclusive answers.
   *
   * Ticking a real allergen clears "none", and ticking "none" clears the
   * rest, because a list saying both "contains peanut" and "contains none of
   * these" is worse than no answer: it looks answered and it is wrong on the
   * half that reaches somebody with an allergy.
   */
  function toggleAllergen(name: string) {
    const without = values.allergens.filter((a) => a !== name && a !== ALLERGEN_NONE);
    set("allergens", values.allergens.includes(name) ? without : [...without, name]);
  }

  function setAllergenNone() {
    set("allergens", values.allergens.includes(ALLERGEN_NONE) ? [] : [ALLERGEN_NONE]);
  }

  function toggleDietary(tag: DietaryTag) {
    set(
      "dietary",
      values.dietary.includes(tag) ? values.dietary.filter((d) => d !== tag) : [...values.dietary, tag],
    );
  }

  /**
   * The veg/non-veg pair is one answer, not two independent ticks:
   * picking one clears the other, and pressing the selected chip again
   * clears both (back to "not stated", which is a legitimate state — see
   * `DIET_MARK_OPTIONS`).
   *
   * Storing them in the same `dietary` array as the notes is what keeps
   * the server contract a single list and the browse facet a single OR;
   * the exclusivity is a property of this control, not of the column.
   * `dietOf` resolves a contradictory pair safely anyway, because a
   * payload can arrive from somewhere this control never touched.
   */
  function setDietMark(mark: DietaryTag) {
    const withoutMarks = values.dietary.filter(
      (d) => d !== "vegetarian" && d !== "non-vegetarian",
    );
    set("dietary", values.dietary.includes(mark) ? withoutMarks : [...withoutMarks, mark]);
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
   * What is being listed, which decides what this form asks.
   *
   * Recomputed as the category changes, so picking "Pickles" turns the shelf
   * life question from optional to required in front of the maker rather than
   * on submit. The only branch here used to be `kind === "craft"` and it
   * changed placeholder text; Etsy and Amazon both serve a per-category
   * attribute set, and this is the same idea at this catalogue's scale.
   */
  const categorySlug = categories.find((c) => c.id === values.categoryId)?.slug;
  const family = resolveFamily({ kind: values.kind, categorySlug });
  const fam = FAMILY_FIELDS[family];
  const asks = (field: FamilyFieldKey) =>
    fam.required.includes(field) || fam.encouraged.includes(field);
  const needs = (field: FamilyFieldKey) => fam.required.includes(field);
  const recipientShelf = isRecipientShelf(categorySlug);
  /**
   * The shelf picker offers every category, food and gift alike (D3,
   * 2026-09-17) — there is no separate "what are you listing" question
   * any more. `setCategory` reads `kind` off whichever shelf gets picked,
   * the way `SellerApplicationCategory` is already derived from
   * specialties rather than asked outright.
   *
   * Subcategories are labelled with their parent — "Shop by meal ›
   * Breakfast" (M58) — and the group name rides in `hint`, the
   * combobox's second line, so "Candles" (gifts) and a same-named food
   * shelf stay tellable apart without lengthening the label itself.
   */
  const categoryOptions = useMemo(() => {
    const nameById = new Map(categories.map((c) => [c.id, c.name]));
    return categories.map((c) => {
      const parentName = c.parentId ? nameById.get(c.parentId) : undefined;
      const groupLabel = (c.group ?? "food") === "craft" ? "Handcrafted Gifts" : "Homemade Food";
      return {
        value: c.id,
        label: parentName ? `${parentName} › ${c.name}` : c.name,
        hint: groupLabel,
      };
    });
  }, [categories]);

  /**
   * The primary is chosen in its own box, so it is never offered twice —
   * and an extra shelf stays on the same side of the catalogue as the
   * primary (`categoriesForKind`), because a food listing's secondary
   * shelf being a craft category is not something M58's multi-shelf
   * feature was meant to allow.
   */
  const extraCategoryOptions = useMemo(() => {
    const sameKindIds = new Set(categoriesForKind.map((c) => c.id));
    return categoryOptions.filter((o) => o.value !== values.categoryId && sameKindIds.has(o.value));
  }, [categoryOptions, categoriesForKind, values.categoryId]);

  // Earnings line inputs: seller payout + commission markup (+pct%, +GST on
  // the fee). Absent/unloaded reads as "no fee" — never a guessed rate.
  const commissionRate: CommissionRate = {
    pct: commission?.pct ?? 0,
    gstPct: commission?.gstPct ?? 0,
    enabled: commission?.enabled ?? false,
  };
  const commPct = commissionRate.pct;
  const defaultRowPrice = Number(values.weightRows[values.defaultRowIndex]?.price) || 0;
  const markup = markupBreakdown(defaultRowPrice, commissionRate);

  /**
   * The category the maker picks decides `kind` (D3, 2026-09-17) — there is
   * no separate "what are you listing" question any more. Switching shelf
   * across the food/craft line can strand the extras on the other side of
   * the catalogue, where the picker no longer lists them; the same
   * stranding `setKind` used to guard against, one level down.
   */
  function setCategory(categoryId: string) {
    const chosen = categories.find((c) => c.id === categoryId);
    const kind: ProductKind = chosen ? chosen.group ?? "food" : values.kind;
    const keptExtras = values.categoryIds.filter((id) =>
      categories.some((c) => c.id === id && (c.group ?? "food") === kind),
    );
    onChange({
      ...values,
      categoryId,
      kind,
      categoryIds: keptExtras,
      // Gifts are posted; only food asks how it travels (`toSellerListingInput`).
      shippingScope: kind === "craft" ? "national" : values.shippingScope,
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

      <FormSection
        id="listing-basics"
        title="Name, shelf and description"
        description="The shelf you pick decides what the rest of this form asks — no separate food-or-gift question."
      >
        <Field label="Product name" error={errors?.name} id={listingFieldId("name")}>
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

            Every shelf, food and gift alike (D3) — the group name rides
            in the combobox's hint line. Picking one decides `kind`
            (`setCategory`), which is what used to be a separate first
            question ("What are you listing?").
          */}
          <Field label="Category" error={errors?.categoryId} labelAsText id={listingFieldId("categoryId")}>
            <Combobox
              label="Category"
              hideLabel
              value={values.categoryId ? [values.categoryId] : []}
              onChange={(next) => setCategory(next[0] ?? "")}
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
          This is the field that decides whether a buyer 300km away can see
          the listing at all — `national` skips the delivery-radius filter
          entirely. Food-only: a gift is always posted
          (`toSellerListingInput`), so the question disappears once a craft
          shelf is chosen rather than being asked and ignored. Shown only
          once a shelf is picked, so it does not appear ahead of the
          category question it depends on.
        */}
        {values.categoryId && values.kind === "food" && (
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
        )}
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
          id={listingFieldId("description")}
          hint="What makes it worth buying — ingredients, process, story."
        >
          <TextArea
            rows={4}
            autoGrow
            value={values.description}
            onChange={(event) => set("description", event.target.value)}
            placeholder={
              isCraft
                ? "Describe the materials, technique, dimensions, and care instructions…"
                : "Describe ingredients, flavour, texture, preparation method, and shelf life…"
            }
          />
        </Field>

        <Field
          label="Anything buyers should know?"
          optional
          error={errors?.disclaimer}
          id={listingFieldId("disclaimer")}
          hint="A caveat about this specific listing — shown next to the description, exactly as you write it."
        >
          <TextArea
            rows={2}
            autoGrow
            value={values.disclaimer}
            onChange={(event) => set("disclaimer", event.target.value)}
            placeholder="e.g. Colours may vary slightly from the photos, or from batch to batch."
          />
        </Field>
      </FormSection>

      <FormSection
        id="listing-prices"
        title="Sizes and prices"
        description="One row per size you sell. The default row is the price shown on the product card. Leave stock blank for a sensible default; type 0 to show it as sold out."
      >
        <div className={styles.weightTable} role="group" aria-label="Sizes and prices">
          <div className={clsx(styles.weightHeadRow, styles.weightHeadRowCraft)} aria-hidden="true">
            <span className={styles.weightHead}>Default</span>
            <span className={styles.weightHead}>Size</span>
            <span className={styles.weightHead}>Colour</span>
            <span className={styles.weightHead}>Price</span>
            <span className={styles.weightHead}>Was (MRP)</span>
            <span className={styles.weightHead}>Stock</span>
            <span />
          </div>
          {values.weightRows.map((row, index) => (
            <div key={index} className={clsx(styles.weightRow, styles.weightRowCraft)}>
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
              <Field
                label="Size"
                className={styles.cell}
                error={errors?.weightRows?.[index]}
                id={listingFieldId("weightRows", index)}
              >
                <Input
                  dense
                  placeholder={isCraft ? "Standard" : "250 g"}
                  value={row.label}
                  onChange={(event) => updateRow(index, { label: event.target.value })}
                />
              </Field>
              {/*
                Swatches, not the free-text box this used to be
                (2026-09-14). The guided flow has had a picker since M45
                while the long form — the one an EDIT opens by default —
                asked the maker to type colour names, match whatever
                spelling the guided flow had written, and discover the
                40-character label cap by being refused. Both forms write
                one `ListingFormValues` (M45), so both have to offer the
                same way of filling it in.
              */}
              <div className={styles.cell}>
                <ColourSwatches
                  label="Colour"
                  size={row.label}
                  value={row.colour}
                  onChange={(next) => updateRow(index, { colour: next })}
                />
                {row.colour ? <p className={styles.colourEcho}>{row.colour}</p> : null}
              </div>
              <Field
                label="Your payout (₹)"
                className={styles.cell}
                hint={commissionRate.enabled ? `+${commPct}% commission (+GST) added` : "Nothing added right now"}
              >
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
        {defaultRowPrice > 0 && commissionRate.enabled ? (
          <p className={styles.earnings} aria-live="polite">
            You receive {formatCurrency(markup.sellerWants)} → commission (+{commPct}%){" "}
            +{formatCurrency(markup.commission)}
            {markup.gst > 0 ? <> → GST on commission +{formatCurrency(markup.gst)}</> : null} → customer pays{" "}
            {formatCurrency(markup.customerPrice)}.
            <br />
            <strong>It’ll be {formatCurrency(markup.customerPrice)} for the customer, all fees included.</strong>
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

        {/* Dimensions, Materials and Care — general for all products */}
        <FieldGrid columns={2}>
          {asks("dimensions") && (
          <Field
            label="Dimensions"
            optional={!needs("dimensions")}
            error={errors?.dimensions}
            id={listingFieldId("dimensions")}
            hint={
              family === "worn"
                ? "Length, and whether it adjusts. Fit is the commonest reason a gift comes back."
                : isCraft
                  ? "e.g. 15 × 10 × 5 cm — the first thing somebody asks about a piece for their home."
                  : "e.g. 8\" dia, 500 ml jar, 20 × 15 cm box"
            }
          >
            <Input
              value={values.dimensions}
              onChange={(event) => set("dimensions", event.target.value)}
              placeholder={isCraft ? "15 × 10 × 5 cm" : "8\" dia or 20 × 15 × 5 cm"}
            />
          </Field>
          )}
          {asks("material") && (
          <Field
            label={family === "jarred" ? "Packaging" : "Material"}
            optional={!needs("material")}
            error={errors?.material}
            id={listingFieldId("material")}
            hint={isCraft ? "e.g. 100% Soy Wax, Brass" : "e.g. Glass jar, Tin box, Eco packaging"}
          >
            <Input
              value={values.material}
              onChange={(event) => set("material", event.target.value)}
              placeholder={isCraft ? "100% Soy Wax" : "Glass jar / Tin box"}
            />
          </Field>
          )}
          {asks("careInstructions") && (
          <Field
            label="Care instructions"
            optional
            error={errors?.careInstructions}
            id={listingFieldId("careInstructions")}
            hint={isCraft ? "e.g. Hand wash only, keep away from direct sunlight" : "e.g. Keep refrigerated, consume within 3 days"}
            className={styles.fullWidth}
          >
            <Input
              value={values.careInstructions}
              onChange={(event) => set("careInstructions", event.target.value)}
              placeholder={isCraft ? "Hand wash only" : "Keep refrigerated, consume within 3 days"}
            />
          </Field>
          )}
        </FieldGrid>

        {/*
          Ingredients and shelf life are REQUIRED for food and say so.

          They were marked "Optional", carried no `error` prop, and were
          made mandatory by the food-safety change in 4363698 — three
          states that cannot all be true. Every food listing created
          before that commit has both blank, so opening one to change its
          price and pressing Save produced "2 things are missing — they
          are marked on the form" with nothing marked anywhere and the
          word "Optional" beside both culprits. That is the bug a
          HomeKrafter filmed: a red banner and no way to find it.
        */}
        {/*
          Say why the form is short here.

          Half the gift shelves name WHO a gift is for — "For her", "For
          kids" — which tells us nothing about what the thing is, so the
          form can only ask the general questions. Silently asking fewer
          would read as the form not caring; this says what would unlock
          the rest, and M58 already lets a listing sit on both shelves.
        */}
        {recipientShelf && (
          <Notice tone="info">
            “{categories.find((c) => c.id === values.categoryId)?.name}” says who this is
            for, not what it is. Add a second shelf above that names the thing — jewellery,
            candles, ceramics — and we will ask the questions buyers of that thing actually have.
          </Notice>
        )}

        {asks("ingredients") && (
          <Field
            label="Ingredients"
            optional={!needs("ingredients")}
            error={errors?.ingredients}
            id={listingFieldId("ingredients")}
            hint={
              family === "skin"
                ? "Everything in it. This goes on somebody's skin, and people with sensitivities read it before they buy."
                : "List key ingredients and allergens (e.g. peanuts, mustard, milk). Buyers with allergies rely on this."
            }
          >
            <Input
              value={values.ingredients ?? ""}
              onChange={(event) => set("ingredients", event.target.value)}
              placeholder={
                family === "skin"
                  ? "e.g. Shea butter, coconut oil, lavender essential oil"
                  : "e.g. Roasted peanuts, jaggery, cardamom, pure ghee"
              }
            />
          </Field>
        )}

        {asks("allergens") && (
          <Fieldset
            legend="Does it contain any of these?"
            optional
            hint="The eight FSSAI names a label has to declare, plus sesame and mustard. Tick every one it contains, or say none — leaving it blank reads as “we never asked”, and somebody with an allergy cannot tell the difference."
          >
            <ChipRow>
              <Chip
                label={ALLERGEN_NONE}
                selected={values.allergens.includes(ALLERGEN_NONE)}
                onClick={() => setAllergenNone()}
              />
              {ALLERGEN_OPTIONS.map((option) => (
                <Chip
                  key={option}
                  label={option}
                  selected={values.allergens.includes(option)}
                  onClick={() => toggleAllergen(option)}
                />
              ))}
            </ChipRow>
          </Fieldset>
        )}

        {asks("servingGuidance") && (
          <Field
            label="How to serve it"
            optional
            error={errors?.servingGuidance}
            id={listingFieldId("servingGuidance")}
            hint="Serves how many, and how it is best eaten. This is the line that makes a photograph make sense."
          >
            <Input
              value={values.servingGuidance ?? ""}
              onChange={(event) => set("servingGuidance", event.target.value)}
              placeholder="e.g. Serves 2. Warm for a minute and eat with rice."
            />
          </Field>
        )}

        {(asks("shelfLife") || asks("storageInstructions")) && (
          <FieldGrid columns={2}>
            {asks("shelfLife") && (
              <Field
                label={family === "skin" ? "Use within" : "Shelf life"}
                optional={!needs("shelfLife")}
                error={errors?.shelfLife}
                id={listingFieldId("shelfLife")}
                hint={
                  family === "skin"
                    ? "How long it keeps once opened."
                    : "How long it stays fresh after receipt."
                }
              >
                <Input
                  value={values.shelfLife ?? ""}
                  onChange={(event) => set("shelfLife", event.target.value)}
                  placeholder="e.g. 30 days from dispatch"
                />
              </Field>
            )}
            {asks("storageInstructions") && (
              <Field
                label="Storage instructions"
                optional
                error={errors?.storageInstructions}
                id={listingFieldId("storageInstructions")}
                hint="How the customer should store it."
              >
                <Input
                  value={values.storageInstructions ?? ""}
                  onChange={(event) => set("storageInstructions", event.target.value)}
                  placeholder="e.g. Store in a cool dry place in an airtight container"
                />
              </Field>
            )}
          </FieldGrid>
        )}

        {/* A candle has no dietary tags, and asking reads as a form that
            doesn't know what it's selling. Gated on the family rather than
            on `kind` so a bar of soap is not asked either — it is a craft
            that DOES get the ingredient question above, which is exactly the
            case the old food/craft binary got wrong in both directions. */}
        {asks("dietary") && (
          <Fieldset
            legend="Veg or non-veg"
            optional
            hint="Shows as the green or red mark on your listing, and it is how buyers filter. Leave it blank if it does not apply — we would rather show nothing than the wrong mark."
          >
            <ChipRow>
              {DIET_MARK_OPTIONS.map((option) => (
                <Chip
                  key={option.value}
                  label={option.label}
                  selected={values.dietary.includes(option.value)}
                  onClick={() => setDietMark(option.value)}
                />
              ))}
            </ChipRow>
          </Fieldset>
        )}

        {asks("dietary") && (
          <Fieldset legend="Other dietary notes" optional>
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

        {/*
          Ready to ship, or made to order (G1, 2026-09-16) — replaces the
          old `isPackaged` checkbox here, which was labelled "Ready to
          ship" but wrote a field nothing downstream ever reads. This
          writes the real `Fulfilment` column the Pre-order badge and the
          Dispatch filter both read.

          Asked of every listing, food and craft alike — a thali and a
          candle are both either in hand or made once somebody orders it.
          Left unanswered (`""`) rather than defaulted to "ready to ship":
          guessing that on a maker's behalf is a delivery promise the
          platform has no basis for, same reasoning as `workingDays` and
          `dietary`. How much notice a made-to-order piece needs is *not*
          a new column — it's the existing `prepTimeMins`, asked in days
          here for a craft listing and minutes for food (the unit a
          jeweller and a cook would each actually reach for).
        */}
        <Fieldset
          legend="Ready to ship, or made to order?"
          hint="Changes what buyers are promised, and whether a “Pre-order” badge shows on the card."
        >
          <ChoiceCards
            label="Ready to ship, or made to order?"
            value={values.fulfilment}
            onChange={(next) => set("fulfilment", next)}
            options={[
              {
                value: "ready_to_ship",
                title: "Ready to ship",
                hint: "You already have it, or it's cooked when ordered with no special notice.",
              },
              {
                value: "made_to_order",
                title: "Made to order",
                hint: isCraft
                  ? "You make each one once it's bought."
                  : "You need advance notice before you can cook it.",
              },
            ]}
          />
        </Fieldset>

        {values.fulfilment === "made_to_order" && (
          <Field
            label={isCraft ? "How many days to make and send it?" : "How much notice do you need?"}
            error={errors?.prepTimeMins}
            id={listingFieldId("prepTimeMins")}
            hint={
              isCraft
                ? "Whole days, from the order landing to it leaving for dispatch."
                : `In minutes (e.g. 120 for 2 hours, 2880 for two days). Over ${PRE_ORDER_THRESHOLD_MINS} mins shows a "Pre-order" badge.`
            }
          >
            <Input
              type="number"
              min={1}
              inputMode="numeric"
              value={values.prepTimeMins}
              onChange={(event) => set("prepTimeMins", event.target.value)}
              placeholder={isCraft ? "e.g. 3" : "e.g. 120 for 2 hours, 2880 for two days"}
            />
          </Field>
        )}

        {/*
          Personalisation (G1/D11) — a first-class listing fact rather
          than something only mentioned in the description. The buyer's
          own entry point for it (typing the actual name/date/message) is
          a separate feature (G4) and is not built by this.
        */}
        <div className={styles.options}>
          <CheckRow
            label="Can the buyer ask for a personal touch?"
            help="A name, date, colour or short message they'd tell you before checkout — a candle's scent choice, a cushion's monogram."
            checked={values.isPersonalisable}
            onChange={(event) => set("isPersonalisable", event.target.checked)}
          />
        </div>

        {values.isPersonalisable && (
          <Field
            label="What should we ask them for?"
            error={errors?.personalisationPrompt}
            id={listingFieldId("personalisationPrompt")}
            hint="Shown to the buyer as the question they answer — in your own words."
          >
            <Input
              value={values.personalisationPrompt}
              onChange={(event) => set("personalisationPrompt", event.target.value)}
              placeholder='e.g. "Which colour would you like?"'
              maxLength={LISTING_LIMITS.personalisationPrompt}
            />
          </Field>
        )}

        <Fieldset legend="Tags" optional>
          <ChipRow>
            {TAG_OPTIONS.map((tag) => (
              <Chip key={tag} label={tag} selected={values.tags.includes(tag)} onClick={() => toggleTag(tag)} />
            ))}
          </ChipRow>
        </Fieldset>

        <div className={styles.options}>
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
