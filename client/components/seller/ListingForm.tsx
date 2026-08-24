"use client";

import { useMemo } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Chip } from "@/components/ui/Chip";
import { Combobox } from "@/components/ui/Combobox";
import { Textarea } from "@/components/ui/Textarea";
import { ImageUpload } from "@/components/ui/ImageUpload";
import type { DietaryTag, ProductKind, ProductShippingScope, ProductTag, SellerCommission } from "@/lib/types";
import type { SellerListingInput } from "@/lib/api";
import { commissionBreakdown, priceForTarget } from "@/lib/commission";
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

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

/** Builds the `lib/api/seller` mutation payload from form state, deriving each weight row's `sku` (stable for existing rows, freshly slugified for new ones) and `defaultWeightSku` from the marked default row. */
export function toSellerListingInput(values: ListingFormValues): SellerListingInput {
  const weightOptions = values.weightRows.map((row) => ({
    sku: row.sku ?? `${slugify(values.name)}-${slugify(row.label)}`,
    label: row.label,
    price: Number(row.price) || 0,
    mrp: Number(row.mrp) || 0,
    stock: Number(row.stock) || 0,
  }));

  return {
    name: values.name,
    categoryId: values.categoryId,
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

export interface ListingFormProps {
  values: ListingFormValues;
  onChange: (values: ListingFormValues) => void;
  /** `group` absent reads as `"food"` — every category predating M20 was. */
  categories: { id: string; name: string; group?: ProductKind }[];
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
}

/**
 * Shared create/edit form for a maker's `Product` — covers the real
 * schema (name, category, occasions, dietary, description, multi-tier
 * `weightOptions`, tags, photo). Both `/seller/listings/new` and
 * `/seller/listings/[id]` render this and only differ in how they submit
 * (`createSellerListing` vs. `updateSellerListing`, `lib/api/seller.ts`).
 */
export function ListingForm({
  values,
  onChange,
  categories,
  occasions,
  commission,
  taxonomy,
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
  const categoryOptions = useMemo(
    () => categoriesForKind.map((c) => ({ value: c.id, label: c.name })),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- rebuilt from the same `categories` prop and `values.kind` each render
    [categories, values.kind],
  );

  // Earnings line inputs (M37): the default tier is the price on the
  // product card, so that is the one the line explains.
  const defaultRowPrice = Number(values.weightRows[values.defaultRowIndex]?.price) || 0;
  const breakdown = commissionBreakdown(defaultRowPrice, commission?.pct ?? 0);

  /**
   * Switching kind can strand the chosen category on the other side of the
   * catalogue, where the `<select>` no longer lists it — leaving a value
   * set that nothing displays. Clearing it makes the empty select honest.
   */
  function setKind(kind: ProductKind) {
    const stillValid = categories.some(
      (c) => c.id === values.categoryId && (c.group ?? "food") === kind,
    );
    onChange({ ...values, kind, categoryId: stillValid ? values.categoryId : "" });
  }

  return (
    <div className={styles.form}>
      {/*
        First, because it decides what the rest of the form asks. A jeweller
        must not be asked whether their earrings are gluten-free, and the
        M20 note in the plan is explicit that the FSSAI badge is
        food-specific.
      */}
      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>What are you listing?</h2>
        <div className={styles.chipGroup}>
          <Chip
            label="Homemade food"
            selected={!isCraft}
            onClick={() => setKind("food")}
          />
          <Chip
            label="Handcrafted gift"
            selected={isCraft}
            onClick={() => setKind("craft")}
          />
        </div>
        <p className={styles.checkboxHelp}>
          {isCraft
            ? "Handcrafted gifts appear on the Gifts page. You won't be asked about ingredients or dietary tags."
            : "Homemade food appears in the main shop, and can also go on your snacks menu."}
        </p>
      </div>

      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>How does it reach the buyer?</h2>
        <div className={styles.chipGroup}>
          <Chip
            label="I deliver locally"
            selected={values.shippingScope === "local"}
            onClick={() => set("shippingScope", "local")}
          />
          <Chip
            label="I post it anywhere in India"
            selected={values.shippingScope === "national"}
            onClick={() => set("shippingScope", "national")}
          />
        </div>
        {/*
          This is the field that decides whether a buyer 300km away can see
          the listing at all — `national` skips the delivery-radius filter
          entirely. It is asked separately from the kind on purpose: a
          kitchen posting pickles across India is a real case, and deriving
          this from "is it food" would forbid it.
        */}
        <p className={styles.checkboxHelp}>
          {values.shippingScope === "national"
            ? "Shoppers across India will see this, not only people inside your delivery distance. Only choose this if you can genuinely pack and post it."
            : "Only shoppers inside your delivery distance will see this. Choose the other option if you can post it — a jar of pickle travels further than a hot meal."}
        </p>
      </div>

      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>Basics</h2>
        <div className={styles.grid}>
          <label className={styles.fieldWide}>
            <span className={styles.label}>Product name</span>
            <input
              className={styles.input}
              value={values.name}
              onChange={(event) => set("name", event.target.value)}
              placeholder="e.g. Mango Thokku Pickle"
            />
          </label>
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
          <div className={styles.field}>
            <Combobox
              label="Category"
              value={values.categoryId ? [values.categoryId] : []}
              onChange={(next) => set("categoryId", next[0] ?? "")}
              options={categoryOptions}
              placeholder="Select category"
              emptyMessage="Nothing by that name — try a shorter word."
              onSuggest={
                taxonomy?.suggestCategory
                  ? (name) => taxonomy.suggestCategory!(name, values.kind)
                  : undefined
              }
              createNoun="shelf"
            />
          </div>
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
          <div className={styles.fieldWide}>
            <Textarea
              label="Description"
              value={values.description}
              onChange={(event) => set("description", event.target.value)}
              placeholder="What makes it worth buying — ingredients, process, story."
            />
          </div>
        </div>
      </div>

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
      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>Occasions</h2>
        <Combobox
          label="Occasions this suits"
          hideLabel
          multiple
          placeholder="Search occasions…"
          value={values.occasionIds}
          onChange={(next) => set("occasionIds", next)}
          options={occasionOptions}
          emptyMessage="No occasion by that name."
          hint="Optional — it puts your listing on the occasion's page."
          onCreate={taxonomy?.createOccasion}
          onSuggest={taxonomy?.suggestOccasion}
          createNoun="occasion"
          className={styles.occasionPicker}
        />
      </div>

      {/* Food only. A candle has no dietary tags, and asking reads as a
          form that doesn't know what it's selling. */}
      {!isCraft && (
        <div className={styles.section}>
          <h2 className={styles.sectionTitle}>Dietary</h2>
          <div className={styles.chipGroup}>
            {DIETARY_OPTIONS.map((option) => (
              <Chip
                key={option.value}
                label={option.label}
                selected={values.dietary.includes(option.value)}
                onClick={() => toggleDietary(option.value)}
              />
            ))}
          </div>
        </div>
      )}

      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>Tags</h2>
        <div className={styles.chipGroup}>
          {TAG_OPTIONS.map((tag) => (
            <Chip key={tag} label={tag} selected={values.tags.includes(tag)} onClick={() => toggleTag(tag)} />
          ))}
        </div>
        <label className={styles.checkboxRow}>
          <input
            type="checkbox"
            checked={values.isPackaged}
            onChange={(event) => set("isPackaged", event.target.checked)}
          />
          <span className={styles.checkboxLabel}>
            {isCraft
              ? "Ready to ship (vs. made to order)"
              : "Ready-to-ship packaged food (vs. made-to-order)"}
          </span>
        </label>
        {!isCraft && (
          <>
            <label className={styles.checkboxRow}>
              <input
                type="checkbox"
                checked={values.isSnack}
                onChange={(event) => set("isSnack", event.target.checked)}
              />
              <span className={styles.checkboxLabel}>Also list this on my snacks menu</span>
            </label>
            <p className={styles.checkboxHelp}>
              Snacks are ordered over WhatsApp rather than checked out on the
              site. Ticking this adds it to that menu; it stays in the main
              shop either way.
            </p>
          </>
        )}
        <label className={styles.checkboxRow}>
          <input
            type="checkbox"
            checked={values.isHamper}
            onChange={(event) => set("isHamper", event.target.checked)}
          />
          <span className={styles.checkboxLabel}>
            This is a ready-made gift hamper
          </span>
        </label>
        <p className={styles.checkboxHelp}>
          Ticking this also lists it on the Gift hampers page. It stays in the
          main shop either way — a hamper is a listing like any other, priced
          and packed by you.
        </p>
      </div>

      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>Weight tiers &amp; pricing</h2>
        <div className={styles.weightTable}>
          <div className={styles.weightHeadRow}>
            <span className={styles.weightHead}>Def.</span>
            <span className={styles.weightHead}>Label</span>
            <span className={styles.weightHead}>Price</span>
            <span className={styles.weightHead}>MRP</span>
            <span className={styles.weightHead}>Stock</span>
            <span />
          </div>
          {values.weightRows.map((row, index) => (
            <div key={index} className={styles.weightRow}>
              <input
                type="radio"
                name="defaultWeightRow"
                className={styles.defaultRadio}
                checked={values.defaultRowIndex === index}
                onChange={() => set("defaultRowIndex", index)}
                aria-label={`Make "${row.label || `tier ${index + 1}`}" the default tier`}
              />
              <input
                className={styles.weightInput}
                placeholder="250 g"
                value={row.label}
                onChange={(event) => updateRow(index, { label: event.target.value })}
                aria-label="Weight/size label"
              />
              <input
                className={styles.weightInput}
                type="number"
                min={0}
                placeholder="Price"
                value={row.price}
                onChange={(event) => updateRow(index, { price: event.target.value })}
                aria-label="Price"
              />
              <input
                className={styles.weightInput}
                type="number"
                min={0}
                placeholder="MRP"
                value={row.mrp}
                onChange={(event) => updateRow(index, { mrp: event.target.value })}
                aria-label="MRP"
              />
              <input
                className={styles.weightInput}
                type="number"
                min={0}
                placeholder="Stock"
                value={row.stock}
                onChange={(event) => updateRow(index, { stock: event.target.value })}
                aria-label="Stock"
              />
              <button
                type="button"
                className={styles.removeRowButton}
                onClick={() => removeRow(index)}
                disabled={values.weightRows.length <= 1}
                aria-label="Remove weight tier"
              >
                <Trash2 size={14} strokeWidth={1.8} />
              </button>
            </div>
          ))}
        </div>
        <button type="button" className={styles.addRowButton} onClick={addRow}>
          <Plus size={15} strokeWidth={2} aria-hidden="true" />
          Add weight tier
        </button>
        {/*
          The M37 earnings line: what the default tier's price works out
          to after the platform's cut, at the server-supplied rate — never
          a hardcoded percentage. Hidden when no rate rides in (the admin
          editor) or no price is typed yet.
        */}
        {commission && defaultRowPrice > 0 ? (
          <p className={styles.hint} aria-live="polite">
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
      </div>

      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>Photo</h2>
        <ImageUpload
          label="Product photo"
          purpose="listing"
          ratio="1/1"
          placeholderLabel={values.name || "Product photo"}
          hint="Shot in daylight, on a plain surface, sells better than a styled one. Leave blank for a placeholder."
          value={values.imagePath}
          onChange={(url) => set("imagePath", url)}
        />
      </div>
    </div>
  );
}
