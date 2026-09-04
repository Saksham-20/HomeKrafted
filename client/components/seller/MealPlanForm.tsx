"use client";

import { ImageUpload } from "@/components/ui/ImageUpload";
import { ChoiceCards } from "@/components/portal/ChoiceCards";
import { Field, FieldGrid, Fieldset, Input, Select, Switch, TextArea } from "@/components/portal/Field";
import { FormSection } from "@/components/portal/FormSection";
import { MAX_MENU_LINES, SLOT_OPTIONS, type MealPlanFormValues } from "@/lib/meal-plans";
import type { MealDiet, Product } from "@/lib/types";
import styles from "./MealPlanForm.module.css";

export interface MealPlanFormProps {
  values: MealPlanFormValues;
  onChange: (values: MealPlanFormValues) => void;
  /** This kitchen's own listings, for the optional "backed by" link. */
  listings: Product[];
  /** The windows this plan currently offers. Only known for a saved plan. */
  brackets?: string[];
}

/** The sections this form renders, for the editor's jump-nav. */
export const MEAL_PLAN_FORM_SECTIONS = [
  { id: "plan-basics", label: "The plan" },
  { id: "plan-slot", label: "When it arrives" },
  { id: "plan-food", label: "Food & price" },
  { id: "plan-capacity", label: "Capacity & status" },
] as const;

const SLOT_HINT: Record<MealPlanFormValues["slotKind"], string> = {
  breakfast: "Delivered in your breakfast window.",
  lunch: "Delivered in your lunch window.",
  dinner: "Delivered in your dinner window.",
  other: "A box, a batch, anything not tied to a mealtime.",
};

/**
 * Create/edit form for a `MealPlan`.
 *
 * The shape it has to allow is the whole point of M20: a plan is **not**
 * necessarily breakfast, lunch or dinner. "Something else" is a peer of the
 * three meals here rather than an advanced option, because a monthly pickle
 * box is an ordinary thing for a home kitchen to sell and the software
 * used to have no way to say it.
 *
 * On the shared portal kit since 2026-09-04: four sections instead of
 * eight headings, the slot as choice cards, the photo beside the name,
 * and "taking new subscribers" as a switch — it is a state, not one
 * option among several.
 */
export function MealPlanForm({ values, onChange, listings, brackets }: MealPlanFormProps) {
  function set<K extends keyof MealPlanFormValues>(key: K, value: MealPlanFormValues[K]) {
    onChange({ ...values, [key]: value });
  }

  const isOther = values.slotKind === "other";

  return (
    <div className={styles.form}>
      <FormSection id="plan-basics" title="The plan" description="What a subscriber signs up for, in your words, with a photo of what actually arrives.">
        <div className={styles.basicsRow}>
          <div className={styles.basicsFields}>
            <Field label="Plan name">
              <Input
                value={values.name}
                onChange={(event) => set("name", event.target.value)}
                placeholder="e.g. Everyday Punjabi Thali"
              />
            </Field>
            <Field label="Description" hint="What arrives, how it's cooked, what makes it yours.">
              <TextArea
                rows={4}
                autoGrow
                value={values.description}
                onChange={(event) => set("description", event.target.value)}
              />
            </Field>
          </div>
          {/*
            `purpose="menu"` rather than a new upload purpose: this is food a
            kitchen cooks, same as a snack menu item, and it belongs in the
            same folder. `purpose` is a closed set shared with
            `uploads.service.ts` (CLAUDE.md M14) — adding a member for a
            photo that wants the existing folder would be churn.
          */}
          <ImageUpload
            label="Plan photo"
            purpose="menu"
            ratio="4/3"
            placeholderLabel={values.name || "Plan photo"}
            hint="The actual thali or box sells better than a styled shot."
            value={values.imageSrc}
            onChange={(url) => set("imageSrc", url)}
            className={styles.photo}
          />
        </div>
      </FormSection>

      <FormSection
        id="plan-slot"
        title="When it arrives"
        description="Delivery windows come from your opening hours, narrowed to the slot you pick here."
      >
        <ChoiceCards
          label="What kind of plan is this?"
          value={values.slotKind}
          onChange={(next) => set("slotKind", next)}
          columns={2}
          options={SLOT_OPTIONS.map((option) => ({
            value: option.value,
            title: option.label,
            hint: SLOT_HINT[option.value],
          }))}
        />

        {isOther ? (
          <Field
            label="Call it what it is"
            hint="This is what buyers see on the card. A plan that isn't tied to a mealtime gets your full opening hours to deliver in, rather than a lunch or dinner window."
          >
            <Input
              value={values.slotLabel}
              onChange={(event) => set("slotLabel", event.target.value)}
              placeholder="Monthly pickle box"
              required
            />
          </Field>
        ) : (
          <p className={styles.hint}>
            Set your hours on{" "}
            <a href="/seller/profile#hours" className={styles.inlineLink}>
              About your kitchen
            </a>{" "}
            — if they don&rsquo;t overlap the {values.slotKind} window, this plan offers no
            windows and nobody can subscribe.
          </p>
        )}

        {brackets && (
          <p className={styles.brackets}>
            {brackets.length === 0 ? (
              <strong className={styles.warn}>
                No delivery windows. Your opening hours don&rsquo;t overlap this slot, so nobody can
                subscribe until you widen them.
              </strong>
            ) : (
              <>
                <strong>{brackets.length} delivery windows</strong> — {brackets[0]} to{" "}
                {brackets[brackets.length - 1]}, in half hours.
              </>
            )}
          </p>
        )}
      </FormSection>

      <FormSection id="plan-food" title="Food and price">
        <FieldGrid>
          <Field label="Diet">
            <Select value={values.diet} onChange={(event) => set("diet", event.target.value as MealDiet)}>
              <option value="veg">Vegetarian</option>
              <option value="non-veg">Non-vegetarian</option>
            </Select>
          </Field>
          <Field
            label={`Price per ${isOther ? "delivery" : "meal"}`}
            hint="A price change applies to new subscribers only. Anyone already on the plan keeps the price they agreed to."
          >
            <Input
              type="number"
              min={1}
              step="0.01"
              inputMode="decimal"
              affixStart="₹"
              value={values.pricePerMeal}
              onChange={(event) => set("pricePerMeal", event.target.value)}
              placeholder="120"
            />
          </Field>
        </FieldGrid>
        <Field label="What they get" hint="The plate, listed. This is what the card shows.">
          <Input
            value={values.servingSize}
            onChange={(event) => set("servingSize", event.target.value)}
            placeholder="4 rotis, dal, sabzi, salad, achaar"
          />
        </Field>
        <Field
          label="Weekly rotation"
          optional
          hint={`One line each, up to ${MAX_MENU_LINES}. Exactly 7 lines are read Monday to Sunday and subscribers see that day's line; any other count shows as a plain list. Buyers are told it's a guide — the day-by-day menus you set below the plan are the promise.`}
        >
          <TextArea
            rows={5}
            autoGrow
            maxRows={16}
            value={values.weeklyMenu}
            onChange={(event) => set("weeklyMenu", event.target.value)}
            placeholder={"Mon — Rajma chawal\nTue — Kadhi pakora\nWed — Chole"}
          />
        </Field>
      </FormSection>

      <FormSection id="plan-capacity" title="Capacity and status">
        <FieldGrid>
          <Field
            label="Subscriber limit"
            optional
            hint="Once this many people are on the plan it shows as full. Someone who pauses keeps their place; someone who cancels gives it back. Leave it blank only if you genuinely have no ceiling."
          >
            <Input
              type="number"
              min={1}
              inputMode="numeric"
              value={values.maxSubscribers}
              onChange={(event) => set("maxSubscribers", event.target.value)}
              placeholder="No limit"
            />
          </Field>
          {listings.length > 0 && (
            <Field
              label="Linked listing"
              optional
              hint="Link a plan to something you already sell one-off, so the two stay recognisably the same thing."
            >
              <Select value={values.productId} onChange={(event) => set("productId", event.target.value)}>
                <option value="">Not linked</option>
                {listings.map((product) => (
                  <option key={product.id} value={product.id}>
                    {product.name}
                  </option>
                ))}
              </Select>
            </Field>
          )}
        </FieldGrid>
        <Fieldset legend="Availability">
          <Switch
            checked={values.isActive}
            onChange={(next) => set("isActive", next)}
            label="Taking new subscribers"
            help="Off stops new subscribers. Everyone already on the plan keeps the meals they paid for, and you still owe them."
          />
        </Fieldset>
      </FormSection>
    </div>
  );
}
