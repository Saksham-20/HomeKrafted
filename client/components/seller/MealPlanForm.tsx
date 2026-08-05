"use client";

import { Chip } from "@/components/ui/Chip";
import { Textarea } from "@/components/ui/Textarea";
import { ImageUpload } from "@/components/ui/ImageUpload";
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

/**
 * Create/edit form for a `MealPlan`.
 *
 * The shape it has to allow is the whole point of M20: a plan is **not**
 * necessarily breakfast, lunch or dinner. "Something else" is a peer of the
 * three meals here rather than an advanced option, because a monthly pickle
 * box is an ordinary thing for a home kitchen to sell and the software
 * used to have no way to say it.
 */
export function MealPlanForm({ values, onChange, listings, brackets }: MealPlanFormProps) {
  function set<K extends keyof MealPlanFormValues>(key: K, value: MealPlanFormValues[K]) {
    onChange({ ...values, [key]: value });
  }

  const isOther = values.slotKind === "other";

  return (
    <div className={styles.form}>
      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>Basics</h2>
        <div className={styles.grid}>
          <label className={styles.fieldWide}>
            <span className={styles.label}>Plan name</span>
            <input
              className={styles.input}
              value={values.name}
              onChange={(event) => set("name", event.target.value)}
              placeholder="e.g. Everyday Punjabi Thali"
            />
          </label>

          <div className={styles.fieldWide}>
            <Textarea
              label="Description"
              value={values.description}
              onChange={(event) => set("description", event.target.value)}
              placeholder="What arrives, how it's cooked, what makes it yours."
            />
          </div>
        </div>
      </div>

      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>What kind of plan is this?</h2>
        <div className={styles.chipGroup}>
          {SLOT_OPTIONS.map((option) => (
            <Chip
              key={option.value}
              label={option.label}
              selected={values.slotKind === option.value}
              onClick={() => set("slotKind", option.value)}
            />
          ))}
        </div>

        {isOther ? (
          <label className={styles.fieldWide}>
            <span className={styles.label}>Call it what it is</span>
            <input
              className={styles.input}
              value={values.slotLabel}
              onChange={(event) => set("slotLabel", event.target.value)}
              placeholder="Monthly pickle box"
              aria-describedby="slot-label-hint"
              required
            />
            <span className={styles.hint} id="slot-label-hint">
              This is what buyers see on the card. A plan that isn&rsquo;t tied to
              a mealtime gets your full opening hours to deliver in, rather
              than a lunch or dinner window.
            </span>
          </label>
        ) : (
          <p className={styles.hint}>
            Delivery windows come from your opening hours, narrowed to the{" "}
            {values.slotKind} window. Set your hours on{" "}
            <a href="/seller/profile" className={styles.inlineLink}>
              your profile
            </a>{" "}
            — if they don&rsquo;t overlap, this plan offers no windows and nobody
            can subscribe.
          </p>
        )}

        {brackets && (
          <p className={styles.brackets}>
            {brackets.length === 0 ? (
              <strong className={styles.warn}>
                No delivery windows. Your opening hours don&rsquo;t overlap this
                slot, so nobody can subscribe until you widen them.
              </strong>
            ) : (
              <>
                <strong>{brackets.length} delivery windows</strong> — {brackets[0]} to{" "}
                {brackets[brackets.length - 1]}, in half hours.
              </>
            )}
          </p>
        )}
      </div>

      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>Food &amp; price</h2>
        <div className={styles.grid}>
          <label className={styles.field}>
            <span className={styles.label}>Diet</span>
            <select
              className={styles.select}
              value={values.diet}
              onChange={(event) => set("diet", event.target.value as MealDiet)}
            >
              <option value="veg">Vegetarian</option>
              <option value="non-veg">Non-vegetarian</option>
            </select>
          </label>

          <label className={styles.field}>
            <span className={styles.label}>
              Price per {isOther ? "delivery" : "meal"} (₹)
            </span>
            <input
              className={styles.input}
              type="number"
              min={1}
              step="0.01"
              value={values.pricePerMeal}
              onChange={(event) => set("pricePerMeal", event.target.value)}
              placeholder="120"
            />
            <span className={styles.hint}>
              A price change applies to new subscribers only. Anyone already
              on the plan keeps the price they agreed to.
            </span>
          </label>

          <label className={styles.fieldWide}>
            <span className={styles.label}>What they get</span>
            <input
              className={styles.input}
              value={values.servingSize}
              onChange={(event) => set("servingSize", event.target.value)}
              placeholder="4 rotis, dal, sabzi, salad, achaar"
            />
          </label>

          <div className={styles.fieldWide}>
            <Textarea
              label="Rotation"
              value={values.weeklyMenu}
              onChange={(event) => set("weeklyMenu", event.target.value)}
              rows={6}
              placeholder={"Mon — Rajma chawal\nTue — Kadhi pakora\nWed — Chole"}
              hint={`One line each, up to ${MAX_MENU_LINES}. Buyers are told this is a guide, not a contract — home kitchens cook to what the market had that morning.`}
            />
          </div>
        </div>
      </div>

      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>How many people can you take?</h2>
        <label className={styles.field}>
          <span className={styles.label}>Subscriber limit</span>
          <input
            className={styles.input}
            type="number"
            min={1}
            value={values.maxSubscribers}
            onChange={(event) => set("maxSubscribers", event.target.value)}
            placeholder="Leave blank for no limit"
          />
        </label>
        <p className={styles.hint}>
          Once this many people are on the plan it shows as full and stops
          taking subscribers. Someone who pauses keeps their place; someone
          who cancels gives it back. Leave it blank only if you genuinely
          have no ceiling.
        </p>
      </div>

      {listings.length > 0 && (
        <div className={styles.section}>
          <h2 className={styles.sectionTitle}>Linked listing (optional)</h2>
          <label className={styles.fieldWide}>
            <span className={styles.label}>One of your products</span>
            <select
              className={styles.select}
              value={values.productId}
              onChange={(event) => set("productId", event.target.value)}
            >
              <option value="">Not linked</option>
              {listings.map((product) => (
                <option key={product.id} value={product.id}>
                  {product.name}
                </option>
              ))}
            </select>
          </label>
          <p className={styles.hint}>
            Link a plan to something you already sell one-off, so the two stay
            recognisably the same thing. Only your own listings can be linked.
          </p>
        </div>
      )}

      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>Photo</h2>
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
          hint="A photo of the actual thali or box sells better than a styled shot. Leave blank for a placeholder."
          value={values.imageSrc}
          onChange={(url) => set("imageSrc", url)}
        />
      </div>

      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>Availability</h2>
        <label className={styles.checkboxRow}>
          <input
            type="checkbox"
            checked={values.isActive}
            onChange={(event) => set("isActive", event.target.checked)}
          />
          <span className={styles.checkboxLabel}>Taking new subscribers</span>
        </label>
        <p className={styles.hint}>
          Turning this off stops new subscribers. Everyone already on the plan
          keeps the meals they paid for, and you still owe them.
        </p>
      </div>
    </div>
  );
}
