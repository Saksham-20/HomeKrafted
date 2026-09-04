"use client";

import { ImageUpload } from "@/components/ui/ImageUpload";
import { ChoiceCards } from "@/components/portal/ChoiceCards";
import { Field, FieldGrid, Fieldset, Input, Select, Switch, TextArea } from "@/components/portal/Field";
import { FormSection } from "@/components/portal/FormSection";
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

export interface SnackMenuFormErrors {
  name?: string;
  price?: string;
}

export function validateSnackForm(values: SnackMenuFormValues): SnackMenuFormErrors {
  const errors: SnackMenuFormErrors = {};
  if (!values.name.trim()) errors.name = "Give it a name.";
  if (!values.price.trim() || Number(values.price) <= 0) errors.price = "A price above ₹0.";
  return errors;
}

export interface SnackMenuFormProps {
  values: SnackMenuFormValues;
  onChange: (values: SnackMenuFormValues) => void;
  errors?: SnackMenuFormErrors;
}

/**
 * Shared create/edit form for a snack seller's `Snack` — a smaller
 * sibling of the maker `ListingForm` (no weight tiers/occasions, since
 * a `Snack` is single-price with a flat category/diet, not a
 * multi-tier `Product`). Both `/seller/menu/new` and `/seller/menu/[id]`
 * render this and only differ in how they submit.
 *
 * Two sections on the shared kit (2026-09-04): the snack, and how it is
 * listed. It is a WhatsApp menu item, so it is short on purpose.
 */
export function SnackMenuForm({ values, onChange, errors }: SnackMenuFormProps) {
  function set<K extends keyof SnackMenuFormValues>(key: K, value: SnackMenuFormValues[K]) {
    onChange({ ...values, [key]: value });
  }

  return (
    <div className={styles.form}>
      <FormSection title="The snack" description="Snacks are ordered over WhatsApp, so the name, price and photo are what a buyer sees in the chat.">
        <div className={styles.row}>
          <div className={styles.fields}>
            <FieldGrid>
              <Field label="Snack name" error={errors?.name}>
                <Input
                  value={values.name}
                  onChange={(event) => set("name", event.target.value)}
                  placeholder="e.g. Masala Mathri"
                />
              </Field>
              <Field label="Price" error={errors?.price}>
                <Input
                  type="number"
                  min={0}
                  inputMode="decimal"
                  affixStart="₹"
                  value={values.price}
                  onChange={(event) => set("price", event.target.value)}
                  placeholder="0"
                />
              </Field>
            </FieldGrid>
            <Field label="Description" optional>
              <TextArea
                rows={3}
                autoGrow
                value={values.description}
                onChange={(event) => set("description", event.target.value)}
                placeholder="Crispy, flaky, ghee-fried"
              />
            </Field>
          </div>
          <ImageUpload
            label="Snack photo"
            purpose="menu"
            ratio="1/1"
            placeholderLabel={values.name || "Snack photo"}
            hint="A clear shot of the actual portion."
            value={values.imagePath}
            onChange={(url) => set("imagePath", url)}
            className={styles.photo}
          />
        </div>
      </FormSection>

      <FormSection title="How it is listed">
        <FieldGrid>
          <Field label="Category">
            <Select
              value={values.category}
              onChange={(event) => set("category", event.target.value as SnackCategory)}
            >
              {CATEGORY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </Field>
          <Fieldset legend="Diet">
            <ChoiceCards
              label="Diet"
              value={values.diet}
              onChange={(next) => set("diet", next)}
              options={[
                { value: "veg", title: "Veg" },
                { value: "non-veg", title: "Non-veg" },
              ]}
            />
          </Fieldset>
        </FieldGrid>
        <Switch
          checked={values.available}
          onChange={(next) => set("available", next)}
          label="Available on the menu right now"
          help="Off hides it from the menu without deleting it — for a batch that has sold out."
        />
      </FormSection>
    </div>
  );
}
