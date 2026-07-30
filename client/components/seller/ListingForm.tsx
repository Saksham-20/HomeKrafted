"use client";

import { Plus, Trash2 } from "lucide-react";
import { Chip } from "@/components/ui/Chip";
import { Textarea } from "@/components/ui/Textarea";
import { ImageUpload } from "@/components/ui/ImageUpload";
import type { DietaryTag, ProductTag } from "@/lib/types";
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
    dietary: values.dietary,
    description: values.description,
    isPackaged: values.isPackaged,
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
  categories: { id: string; name: string }[];
  occasions: { id: string; name: string }[];
}

/**
 * Shared create/edit form for a maker's `Product` — covers the real
 * schema (name, category, occasions, dietary, description, multi-tier
 * `weightOptions`, tags, image path). Both `/seller/listings/new` and
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

  return (
    <div className={styles.form}>
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
              {categories.map((c) => (
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
          <span className={styles.checkboxLabel}>Ready-to-ship packaged food (vs. made-to-order)</span>
        </label>
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
