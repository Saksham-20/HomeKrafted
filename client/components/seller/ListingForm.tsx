"use client";

import { Plus, Trash2 } from "lucide-react";
import { Chip } from "@/components/ui/Chip";
import { Textarea } from "@/components/ui/Textarea";
import { ImageUpload } from "@/components/ui/ImageUpload";
import type { DietaryTag, ProductKind, ProductShippingScope, ProductTag } from "@/lib/types";
import type { SellerListingInput } from "@/lib/api";
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
}

/**
 * Shared create/edit form for a maker's `Product` — covers the real
 * schema (name, category, occasions, dietary, description, multi-tier
 * `weightOptions`, tags, photo). Both `/seller/listings/new` and
 * `/seller/listings/[id]` render this and only differ in how they submit
 * (`createSellerListing` vs. `updateSellerListing`, `lib/api/seller.ts`).
 */
export function ListingForm({ values, onChange, categories, occasions }: ListingFormProps) {
  function set<K extends keyof ListingFormValues>(key: K, value: ListingFormValues[K]) {
    onChange({ ...values, [key]: value });
  }

  function toggleOccasion(id: string) {
    set(
      "occasionIds",
      values.occasionIds.includes(id)
        ? values.occasionIds.filter((o) => o !== id)
        : [...values.occasionIds, id],
    );
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
          <label className={styles.field}>
            <span className={styles.label}>Category</span>
            <select
              className={styles.select}
              value={values.categoryId}
              onChange={(event) => set("categoryId", event.target.value)}
            >
              <option value="">Select category</option>
              {/*
                Only the categories on this side of the catalogue. Pickles
                is not a category a candle can be in, and offering it is how
                a listing ends up filed somewhere no buyer will look.
              */}
              {categoriesForKind.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className={styles.field}>
            <span className={styles.label}>Cashback %</span>
            <input
              className={styles.input}
              type="number"
              min={0}
              max={100}
              value={values.cashbackPct}
              onChange={(event) => set("cashbackPct", event.target.value)}
            />
          </label>
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

      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>Occasions</h2>
        <div className={styles.chipGroup}>
          {occasions.map((o) => (
            <Chip
              key={o.id}
              label={o.name}
              selected={values.occasionIds.includes(o.id)}
              onClick={() => toggleOccasion(o.id)}
            />
          ))}
        </div>
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
