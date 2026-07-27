"use client";

import { Chip } from "@/components/ui/Chip";
import { Textarea } from "@/components/ui/Textarea";
import { ImageSlot } from "@/components/placeholder/ImageSlot";
import type { DietType, SnackCategory } from "@/lib/types";
import type { SellerMenuInput } from "@/lib/api";
import styles from "./SnackMenuForm.module.css";

export interface SnackMenuFormValues {
  name: string;
  description: string;
  price: string;
  category: SnackCategory;
  diet: DietType;
  imagePath: string;
  available: boolean;
}

export const EMPTY_SNACK_FORM: SnackMenuFormValues = {
  name: "",
  description: "",
  price: "",
  category: "savoury",
  diet: "veg",
  imagePath: "",
  available: true,
};

const CATEGORY_OPTIONS: { value: SnackCategory; label: string }[] = [
  { value: "savoury", label: "Savoury" },
  { value: "sweet", label: "Sweet" },
  { value: "baked", label: "Baked" },
  { value: "namkeen", label: "Namkeen" },
];

const DIET_OPTIONS: { value: DietType; label: string }[] = [
  { value: "veg", label: "Veg" },
  { value: "non-veg", label: "Non-veg" },
];

export function toSellerMenuInput(values: SnackMenuFormValues): SellerMenuInput {
  return {
    name: values.name,
    description: values.description,
    price: Number(values.price) || 0,
    category: values.category,
    diet: values.diet,
    imagePath: values.imagePath,
    available: values.available,
  };
}

export interface SnackMenuFormProps {
  values: SnackMenuFormValues;
  onChange: (values: SnackMenuFormValues) => void;
}

/**
 * Shared create/edit form for a snack seller's `Snack` — a smaller
 * sibling of the maker `ListingForm` (no weight tiers/occasions, since
 * a `Snack` is single-price with a flat category/diet, not a
 * multi-tier `Product`). Both `/seller/menu/new` and `/seller/menu/[id]`
 * render this and only differ in how they submit
 * (`createSellerMenuItem` vs. `updateSellerMenuItem`, `lib/api/seller.ts`).
 */
export function SnackMenuForm({ values, onChange }: SnackMenuFormProps) {
  function set<K extends keyof SnackMenuFormValues>(key: K, value: SnackMenuFormValues[K]) {
    onChange({ ...values, [key]: value });
  }

  return (
    <div className={styles.form}>
      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>Basics</h2>
        <div className={styles.grid}>
          <label className={styles.fieldWide}>
            <span className={styles.label}>Snack name</span>
            <input
              className={styles.input}
              value={values.name}
              onChange={(event) => set("name", event.target.value)}
              placeholder="e.g. Masala Mathri"
            />
          </label>
          <label className={styles.field}>
            <span className={styles.label}>Price (₹)</span>
            <input
              className={styles.input}
              type="number"
              min={0}
              value={values.price}
              onChange={(event) => set("price", event.target.value)}
            />
          </label>
          <div className={styles.fieldWide}>
            <Textarea
              label="Description"
              value={values.description}
              onChange={(event) => set("description", event.target.value)}
              placeholder="Crispy, flaky, ghee-fried"
              rows={3}
            />
          </div>
        </div>
      </div>

      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>Category</h2>
        <div className={styles.chipGroup}>
          {CATEGORY_OPTIONS.map((option) => (
            <Chip
              key={option.value}
              label={option.label}
              selected={values.category === option.value}
              onClick={() => set("category", option.value)}
            />
          ))}
        </div>
      </div>

      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>Diet</h2>
        <div className={styles.chipGroup}>
          {DIET_OPTIONS.map((option) => (
            <Chip
              key={option.value}
              label={option.label}
              selected={values.diet === option.value}
              onClick={() => set("diet", option.value)}
            />
          ))}
        </div>
        <label className={styles.checkboxRow}>
          <input
            type="checkbox"
            checked={values.available}
            onChange={(event) => set("available", event.target.checked)}
          />
          <span className={styles.checkboxLabel}>Available on the menu right now</span>
        </label>
      </div>

      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>Photo</h2>
        <div className={styles.imageRow}>
          <div className={styles.imagePreview}>
            <ImageSlot ratio="1/1" label={values.name || "Snack photo"} src={values.imagePath || undefined} compact />
          </div>
          <div className={styles.imageFields}>
            <label className={styles.field}>
              <span className={styles.label}>Image path</span>
              <input
                className={styles.input}
                value={values.imagePath}
                onChange={(event) => set("imagePath", event.target.value)}
                placeholder="/images/snacks/your-snack.jpg"
              />
            </label>
            <span className={styles.hint}>
              No upload yet — point at an existing path under{" "}
              <code>public/images/snacks/</code>, or leave blank for the placeholder.
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
