"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import { ArrowLeft, ArrowRight, Camera, Check, IndianRupee, Plus, Tag, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Chip } from "@/components/ui/Chip";
import { Combobox, type ComboboxOption } from "@/components/ui/Combobox";
import { ImageUpload } from "@/components/ui/ImageUpload";
import { ImageSlot } from "@/components/placeholder/ImageSlot";
import { Textarea } from "@/components/ui/Textarea";
import { commissionBreakdown } from "@/lib/commission";
import { formatCurrency } from "@/lib/format";
import type { DietaryTag, ProductKind, SellerCommission } from "@/lib/types";
import { DEFAULT_STOCK, type ListingFormValues, type ListingFormWeightRow } from "./ListingForm";
import { parentForSuggestion } from "@/lib/taxonomy-actions";
import type { ListingTaxonomyActions } from "@/lib/taxonomy-actions";
import styles from "./GuidedListingForm.module.css";

/**
 * Veg or non-veg, asked ahead of the notes below and answered once.
 *
 * The guided flow hides questions, never capability (M45) — so it asks
 * this one, because it is the answer buyers filter on and the mark on
 * the card. It stays optional here as it is in the long form: a maker
 * who skips it publishes a listing with no mark, which is honest, and
 * demanding it would block a listing over a question the platform only
 * started asking on 2026-09-05.
 */
const DIET_MARK_OPTIONS: { value: DietaryTag; label: string }[] = [
  { value: "vegetarian", label: "Veg" },
  { value: "non-vegetarian", label: "Non-veg" },
];

const DIETARY_OPTIONS: { value: DietaryTag; label: string }[] = [
  { value: "vegan", label: "Vegan" },
  { value: "contains-egg", label: "Has egg in it" },
  { value: "gluten-free", label: "Gluten-free" },
  { value: "sugar-free", label: "Sugar-free" },
  { value: "contains-nuts", label: "Has nuts in it" },
];

/**
 * What a size is called when nobody says. The full form leaves this blank
 * and refuses to save without it, which is a question a lot of people
 * cannot answer about a cake — so the guided flow answers it for them and
 * lets them change it.
 */
const DEFAULT_SIZE_LABEL = "One";

const STEPS = [
  { key: "photo", title: "Show us what you made" },
  { key: "what", title: "What is it?" },
  { key: "price", title: "What does it cost?" },
  { key: "words", title: "A few words about it" },
] as const;

/** Name field placeholder examples, rotated for visual interest. */
const FOOD_PLACEHOLDERS = ["Mango thokku pickle", "Chocolate brownies", "Besan ladoo", "Masala mathri"];
const CRAFT_PLACEHOLDERS = ["Beeswax candle", "Silver jhumkas", "Hand-painted print", "Macramé wall hanging"];

/** How many top category quick-picks to show. */
const QUICK_PICK_COUNT = 6;

export interface GuidedListingFormProps {
  values: ListingFormValues;
  onChange: (values: ListingFormValues) => void;
  categories: { id: string; name: string; group?: ProductKind; parentId?: string | null }[];
  occasions: { id: string; name: string }[];
  /**
   * What to do when the shelf or occasion somebody wants is not on the
   * list (M50) — see `lib/taxonomy-actions.ts`. This is the screen the
   * gap showed up on: the shelf question is one of the four, and its
   * empty state used to be a dead end.
   */
  taxonomy?: ListingTaxonomyActions;
  commission?: SellerCommission;
  /**
   * Handed the finished values rather than reading the parent's state:
   * the last step fills in the defaults the flow never asked for, and
   * that `onChange` has not been committed by React yet when submit runs.
   */
  onSubmit: (values: ListingFormValues) => void;
  saving: boolean;
  error?: string;
  /** Renders the escape hatch to the long form. */
  onSwitchToFull: () => void;
  submitLabel: string;
}

/**
 * Listing a product in four questions (M45).
 *
 * **What was wrong with the long form.** It asks about twenty things on
 * one page, and the words are ours rather than a cook's: "weight tiers",
 * "MRP", a column headed "Def.", "Ready-to-ship packaged food (vs.
 * made-to-order)". It refuses to save without a description *and* a label
 * on every tier, and says so only after you press the button. None of
 * that is wrong for somebody running twenty listings; all of it is a wall
 * for somebody adding their first, which is the person this platform
 * needs most.
 *
 * **Why photo first.** The research into how Swiggy and Zomato actually
 * onboard restaurants is blunt about it: they do not make partners type
 * menus at all — the restaurant sends photographs and somebody
 * transcribes them. We cannot staff that (M44's admin listing screen is
 * the backstop for the cases where we do), but the ordering is the
 * transferable part. A photograph is the one thing a person holding a
 * phone in their kitchen can produce immediately, it is the thing that
 * actually sells the product, and starting with it means the first screen
 * is a success rather than a form.
 *
 * **What this is not.** It is not a replacement — the long form is one
 * link away from every step and both edit the same `ListingFormValues`,
 * so nothing is lost by switching. A guided flow that hides capability is
 * a worse product for the person on their fortieth listing.
 *
 * Everything the long form asks and this does not gets a sane default,
 * never a silent zero: `mrp` equals the price (no invented discount),
 * stock is asked in plain words, the size label falls back to "One", and
 * the optional questions on the last step are visibly optional.
 *
 * **2026-09-09 redesign.** Multi-size variant cards, colour options for
 * crafts, connected progress bar, step slide transitions, popular shelf
 * quick-picks, and marketplace-inspired UX polish.
 */
export function GuidedListingForm({
  values,
  onChange,
  categories,
  occasions,
  taxonomy,
  commission,
  onSubmit,
  saving,
  error,
  onSwitchToFull,
  submitLabel,
}: GuidedListingFormProps) {
  const [step, setStep] = useState(0);
  const [attempted, setAttempted] = useState(false);
  const [offerByRow, setOfferByRow] = useState<Record<number, boolean>>(() => {
    const init: Record<number, boolean> = {};
    values.weightRows.forEach((row, i) => {
      init[i] = Boolean(row.mrp && Number(row.mrp) > Number(row.price));
    });
    return init;
  });
  const headingRef = useRef<HTMLHeadingElement>(null);
  const headingId = useId();

  const isCraft = values.kind === "craft";
  const rows = values.weightRows;

  // Rotating placeholder for the name field
  const [placeholderIndex, setPlaceholderIndex] = useState(0);
  const placeholders = isCraft ? CRAFT_PLACEHOLDERS : FOOD_PLACEHOLDERS;
  useEffect(() => {
    const timer = setInterval(() => {
      setPlaceholderIndex((prev) => (prev + 1) % placeholders.length);
    }, 3000);
    return () => clearInterval(timer);
  }, [placeholders.length]);

  function set<K extends keyof ListingFormValues>(key: K, value: ListingFormValues[K]) {
    onChange({ ...values, [key]: value });
  }

  function updateRow(index: number, patch: Partial<ListingFormWeightRow>) {
    const next = [...values.weightRows];
    next[index] = { ...next[index], ...patch };
    onChange({ ...values, weightRows: next });
  }

  function addRow() {
    onChange({
      ...values,
      weightRows: [...values.weightRows, { label: "", colour: "", price: "", mrp: "", stock: "" }],
    });
  }

  function removeRow(index: number) {
    if (values.weightRows.length <= 1) return;
    const next = values.weightRows.filter((_, i) => i !== index);
    // Clean up the offer tracking
    const newOffers: Record<number, boolean> = {};
    next.forEach((_, i) => {
      const oldIndex = i >= index ? i + 1 : i;
      newOffers[i] = offerByRow[oldIndex] ?? false;
    });
    setOfferByRow(newOffers);
    onChange({
      ...values,
      weightRows: next,
      defaultRowIndex: Math.min(values.defaultRowIndex, next.length - 1),
    });
  }

  function setKind(kind: ProductKind) {
    const stillValid = categories.some(
      (c) => c.id === values.categoryId && (c.group ?? "food") === kind,
    );
    // Extras strand on the other side of the catalogue just as the
    // primary can — see `ListingForm.setKind`.
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

  function toggleDietary(tag: DietaryTag) {
    set(
      "dietary",
      values.dietary.includes(tag)
        ? values.dietary.filter((d) => d !== tag)
        : [...values.dietary, tag],
    );
  }

  /** Exclusive, and pressing the selected chip clears it — see `ListingForm.setDietMark`. */
  function setDietMark(mark: DietaryTag) {
    const withoutMarks = values.dietary.filter(
      (d) => d !== "vegetarian" && d !== "non-vegetarian",
    );
    set("dietary", values.dietary.includes(mark) ? withoutMarks : [...withoutMarks, mark]);
  }

  /** Subcategories carry their parent's name — see `ListingForm` for why. */
  const categoryOptions = useMemo<ComboboxOption[]>(() => {
    const nameById = new Map(categories.map((c) => [c.id, c.name]));
    return categories
      .filter((c) => (c.group ?? "food") === values.kind)
      .map((c) => {
        const parentName = c.parentId ? nameById.get(c.parentId) : undefined;
        return { value: c.id, label: parentName ? `${parentName} › ${c.name}` : c.name };
      });
  }, [categories, values.kind]);

  /**
   * Quick-pick shelf suggestions — the leaf categories (those with a parent)
   * are more specific and useful as quick picks. Fall back to top-level if
   * there are not enough leaves.
   */
  const quickPickCategories = useMemo(() => {
    const filtered = categories.filter((c) => (c.group ?? "food") === values.kind);
    const leaves = filtered.filter((c) => c.parentId);
    const pool = leaves.length >= 3 ? leaves : filtered;
    return pool.slice(0, QUICK_PICK_COUNT);
  }, [categories, values.kind]);

  const occasionOptions = useMemo<ComboboxOption[]>(
    () => occasions.map((o) => ({ value: o.id, label: o.name })),
    [occasions],
  );

  /**
   * What is still missing on this step, in words somebody can act on.
   * `undefined` means the step is answered.
   *
   * The photo step returns nothing on purpose. A photograph matters more
   * than anything else here and the step says so — but refusing to
   * continue without one would strand somebody whose picture is on a
   * camera in the other room, and the honest cost of that is a listing
   * that never gets written at all.
   */
  function blockingIssue(index: number): string | undefined {
    if (index === 1) {
      if (!values.name.trim()) return "Give it a name — whatever you call it when somebody asks.";
      if (!values.categoryId) return "Pick the shelf it belongs on.";
    }
    if (index === 2) {
      // Every variant needs a price
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        if (!row.price || Number(row.price) <= 0) {
          return rows.length > 1 ? `Size ${i + 1} needs a price.` : "Put in a price.";
        }
        if (offerByRow[i] && Number(row.mrp) <= Number(row.price)) {
          return rows.length > 1
            ? `Size ${i + 1}: the usual price has to be higher than the offer price.`
            : "The usual price has to be higher than the offer price.";
        }
      }
    }
    if (index === 3 && !values.description.trim()) {
      return "Write a line or two about it — this is what a buyer reads before deciding.";
    }
    return undefined;
  }

  const issue = blockingIssue(step);
  const isLast = step === STEPS.length - 1;

  // Focus the new step's heading rather than leaving focus on a "Next"
  // button that has just moved under a different question. Without this a
  // screen-reader user hears nothing change and a keyboard user's next
  // Tab starts from the bottom of the previous step.
  useEffect(() => {
    headingRef.current?.focus();
  }, [step]);

  function goNext() {
    if (issue) {
      setAttempted(true);
      return;
    }
    setAttempted(false);
    if (isLast) {
      // Fill in what the guided flow never asked, so nothing reaches the
      // server as a silent zero.
      const filled = values.weightRows.map((row, i) => ({
        ...row,
        label: row.label.trim() || DEFAULT_SIZE_LABEL,
        // Not on offer means MRP *is* the price. Leaving it at 0 would
        // render a strikethrough against nothing; inflating it would
        // invent a discount the cook never offered.
        mrp: offerByRow[i] ? row.mrp : row.price,
        stock: row.stock.trim() || String(DEFAULT_STOCK),
      }));
      const finished = { ...values, weightRows: filled };
      onChange(finished);
      onSubmit(finished);
      return;
    }
    setStep((s) => s + 1);
  }

  // Default row for earnings preview
  const defaultRow = rows[0] ?? { price: "0" };
  const price = Number(defaultRow.price) || 0;
  const breakdown = commissionBreakdown(price, commission?.pct ?? 0);

  return (
    <div className={styles.wrap}>
      {/* Connected progress bar */}
      <ol className={styles.progress} aria-label="Progress">
        {STEPS.map((s, index) => (
          <li
            key={s.key}
            className={clsx(
              styles.progressStep,
              index === step && styles.progressCurrent,
              index < step && styles.progressDone,
            )}
            aria-current={index === step ? "step" : undefined}
          >
            <span className={styles.progressDot} aria-hidden="true">
              {index < step ? <Check size={13} strokeWidth={2.6} /> : index + 1}
            </span>
            <span className={styles.progressLabel}>{s.title}</span>
            {index < STEPS.length - 1 && (
              <span
                className={clsx(styles.progressBar, index < step && styles.progressDone)}
                aria-hidden="true"
              />
            )}
          </li>
        ))}
      </ol>

      <Card className={styles.card}>
        <p className={styles.stepCount}>
          Question {step + 1} of {STEPS.length}
        </p>
        <h2 className={styles.stepTitle} id={headingId} ref={headingRef} tabIndex={-1}>
          {STEPS[step].title}
        </h2>

        {step === 0 && (
          <div className={styles.stepBody} key="step-0">
            <p className={styles.lead}>
              One clear photo, taken on your phone, in daylight if you can. This is the thing
              that decides whether somebody stops scrolling.
            </p>
            <ImageUpload
              value={values.imagePath}
              onChange={(url) => set("imagePath", url)}
              purpose="listing"
              label="Photo"
              ratio="1/1"
              placeholderLabel="No photo yet"
              hint="Tap to take one now, or choose one you already have"
            />
            <p className={styles.aside}>
              <Camera size={14} strokeWidth={1.8} aria-hidden="true" />
              You can carry on without a photo and add it later — but a listing without one
              sells far less, so it is worth going to get it.
            </p>
          </div>
        )}

        {step === 1 && (
          <div className={styles.stepBody} key="step-1">
            <fieldset className={styles.choiceSet}>
              <legend className={styles.question}>Is it something to eat, or something to keep?</legend>
              <div className={styles.choices}>
                <button
                  type="button"
                  className={clsx(styles.choice, !isCraft && styles.choiceOn)}
                  onClick={() => setKind("food")}
                  aria-pressed={!isCraft}
                >
                  <span className={styles.choiceTitle}>
                    <span className={styles.choiceEmoji} aria-hidden="true">🍯</span>
                    Something to eat
                  </span>
                  <span className={styles.choiceHint}>Pickles, sweets, cakes, snacks</span>
                </button>
                <button
                  type="button"
                  className={clsx(styles.choice, isCraft && styles.choiceOn)}
                  onClick={() => setKind("craft")}
                  aria-pressed={isCraft}
                >
                  <span className={styles.choiceTitle}>
                    <span className={styles.choiceEmoji} aria-hidden="true">🎨</span>
                    Something to keep
                  </span>
                  <span className={styles.choiceHint}>Candles, jewellery, art, gifts</span>
                </button>
              </div>
            </fieldset>

            <label className={styles.field}>
              <span className={styles.question}>What do you call it?</span>
              <input
                className={styles.bigInput}
                value={values.name}
                onChange={(event) => set("name", event.target.value)}
                placeholder={placeholders[placeholderIndex]}
              />
            </label>

            {/* Quick-pick shelf chips */}
            {quickPickCategories.length > 0 && (
              <div className={styles.field}>
                <span className={styles.question}>Which shelf does it belong on?</span>
                <div className={styles.quickPicks}>
                  {quickPickCategories.map((cat) => (
                    <button
                      key={cat.id}
                      type="button"
                      className={clsx(
                        styles.quickPick,
                        values.categoryId === cat.id && styles.quickPickSelected,
                      )}
                      onClick={() => set("categoryId", cat.id)}
                    >
                      {cat.name}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/*
              The shelf list is filtered to the side of the catalogue
              they just picked, so a candle maker is never offered
              "Pickles" — and the ask carries that same answer, so an
              approved shelf lands on the right half without an admin
              having to guess at what somebody meant.
            */}
            <Combobox
              label={quickPickCategories.length > 0 ? "Or search for it" : "Which shelf does it belong on?"}
              labelTone="plain"
              value={values.categoryId ? [values.categoryId] : []}
              onChange={(next) => set("categoryId", next[0] ?? "")}
              options={categoryOptions}
              placeholder={isCraft ? "e.g. Earrings, Candles, Wall Art…" : "e.g. Pickles, Sweets, Breakfast…"}
              emptyMessage="Nothing by that name — try a shorter word."
              hint="This is how shoppers find it when they are browsing."
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
          </div>
        )}

        {step === 2 && (
          <div className={styles.stepBody} key="step-2">
            <div className={styles.variantList}>
              {rows.map((row, index) => (
                <div key={index} className={styles.variantCard}>
                  <div className={styles.variantHeader}>
                    <span className={styles.variantNumber}>
                      {rows.length > 1 ? `Size ${index + 1}` : "Pricing"}
                    </span>
                    <button
                      type="button"
                      className={styles.removeVariant}
                      onClick={() => removeRow(index)}
                      disabled={rows.length <= 1}
                      aria-label={`Remove size ${row.label || index + 1}`}
                    >
                      <X size={16} strokeWidth={1.8} aria-hidden="true" />
                    </button>
                  </div>

                  <div className={styles.variantGrid}>
                    <label className={styles.field}>
                      <span className={styles.question}>
                        Size <span className={styles.optional}>optional</span>
                      </span>
                      <input
                        className={styles.bigInput}
                        value={row.label}
                        onChange={(event) => updateRow(index, { label: event.target.value })}
                        placeholder={isCraft ? "Small" : "250 g"}
                      />
                    </label>
                    {isCraft && (
                      <label className={styles.field}>
                        <span className={styles.question}>
                          Colour <span className={styles.optional}>optional</span>
                        </span>
                        <input
                          className={styles.bigInput}
                          value={row.colour ?? ""}
                          onChange={(event) => updateRow(index, { colour: event.target.value })}
                          placeholder="Rose gold"
                        />
                      </label>
                    )}
                  </div>

                  <div className={styles.variantPriceRow}>
                    <label className={styles.field}>
                      <span className={styles.question}>Price</span>
                      <div className={styles.moneyRow}>
                        <IndianRupee size={18} strokeWidth={2} aria-hidden="true" className={styles.rupee} />
                        <input
                          className={styles.bigInput}
                          type="number"
                          inputMode="numeric"
                          min={0}
                          value={row.price}
                          onChange={(event) => updateRow(index, { price: event.target.value })}
                          placeholder="249"
                        />
                      </div>
                    </label>
                    <label className={styles.field}>
                      <span className={styles.question}>Stock</span>
                      <input
                        className={styles.bigInput}
                        type="number"
                        inputMode="numeric"
                        min={0}
                        value={row.stock}
                        onChange={(event) => updateRow(index, { stock: event.target.value })}
                        placeholder="How many are ready?"
                      />
                    </label>
                  </div>

                  {index === 0 && commission?.enabled && price > 0 && (
                    <span className={styles.help}>
                      You receive {formatCurrency(breakdown.net)} of that; the rest is the platform
                      fee.
                    </span>
                  )}

                  <label className={styles.checkRow}>
                    <input
                      type="checkbox"
                      checked={offerByRow[index] ?? false}
                      onChange={(event) => {
                        setOfferByRow((prev) => ({ ...prev, [index]: event.target.checked }));
                        if (!event.target.checked) updateRow(index, { mrp: row.price });
                      }}
                    />
                    <span>It is on offer — show a crossed-out higher price</span>
                  </label>

                  {offerByRow[index] && (
                    <label className={styles.field}>
                      <span className={styles.question}>What is the usual price?</span>
                      <div className={styles.moneyRow}>
                        <IndianRupee size={18} strokeWidth={2} aria-hidden="true" className={styles.rupee} />
                        <input
                          className={styles.bigInput}
                          type="number"
                          inputMode="numeric"
                          min={0}
                          value={row.mrp}
                          onChange={(event) => updateRow(index, { mrp: event.target.value })}
                          placeholder="299"
                        />
                      </div>
                    </label>
                  )}
                </div>
              ))}
            </div>

            <button type="button" className={styles.addVariantButton} onClick={addRow}>
              <Plus size={16} strokeWidth={2} aria-hidden="true" />
              Add another size
            </button>

            {rows.length <= 1 && (
              <p className={styles.help}>
                Leave the size empty and we will just call it “{DEFAULT_SIZE_LABEL}”.
              </p>
            )}
          </div>
        )}

        {step === 3 && (
          <div className={styles.stepBody} key="step-3">
            <Textarea
              label="Tell a buyer what it is"
              value={values.description}
              onChange={(event) => set("description", event.target.value)}
              placeholder={
                isCraft
                  ? "Hand-poured beeswax, cotton wick, burns about six hours."
                  : "Raw mangoes from the market, sesame oil, no preservatives. Keeps three months."
              }
            />
            <div className={styles.charCount}>
              {values.description.length} / ~200 characters — two or three sentences is plenty
            </div>

            {!isCraft && (
              <fieldset className={styles.choiceSet}>
                <legend className={styles.question}>
                  Is it veg or non-veg? <span className={styles.optional}>optional</span>
                </legend>
                <div className={styles.chipGroup}>
                  {DIET_MARK_OPTIONS.map((option) => (
                    <Chip
                      key={option.value}
                      label={option.label}
                      selected={values.dietary.includes(option.value)}
                      onClick={() => setDietMark(option.value)}
                    />
                  ))}
                </div>
              </fieldset>
            )}

            {values.kind === "food" && (
              <fieldset className={styles.fieldset}>
                <legend className={styles.question}>
                  Anything else a buyer should know?{" "}
                  <span className={styles.optional}>optional</span>
                </legend>
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
              </fieldset>
            )}

            <fieldset className={styles.choiceSet}>
              <legend className={styles.question}>How does it get to them?</legend>
              <div className={styles.choices}>
                <button
                  type="button"
                  className={clsx(styles.choice, values.shippingScope === "local" && styles.choiceOn)}
                  onClick={() => set("shippingScope", "local")}
                  aria-pressed={values.shippingScope === "local"}
                >
                  <span className={styles.choiceTitle}>I deliver it nearby</span>
                  <span className={styles.choiceHint}>Only shoppers near you will see it</span>
                </button>
                <button
                  type="button"
                  className={clsx(
                    styles.choice,
                    values.shippingScope === "national" && styles.choiceOn,
                  )}
                  onClick={() => set("shippingScope", "national")}
                  aria-pressed={values.shippingScope === "national"}
                >
                  <span className={styles.choiceTitle}>I post it anywhere in India</span>
                  <span className={styles.choiceHint}>Only if you can genuinely pack and post</span>
                </button>
              </div>
            </fieldset>

            <Combobox
              label="Is it for an occasion?"
              labelTone="plain"
              multiple
              value={values.occasionIds}
              onChange={(next) => set("occasionIds", next)}
              options={occasionOptions}
              placeholder="Diwali, birthdays…"
              emptyMessage="No occasion by that name."
              onCreate={taxonomy?.createOccasion}
              onSuggest={taxonomy?.suggestOccasion}
              createNoun="occasion"
              hint="Optional — it puts your listing on that occasion's page."
            />

            <div className={styles.preview}>
              <span className={styles.previewLabel}>
                <Tag size={13} strokeWidth={1.9} aria-hidden="true" />
                How shoppers will see it
              </span>
              <div className={styles.previewCard}>
                <ImageSlot
                  ratio="1/1"
                  label={values.name || "Your photo"}
                  alt={values.name}
                  src={values.imagePath || undefined}
                  sizes="120px"
                  compact
                />
                <div>
                  <span className={styles.previewName}>{values.name || "Your product"}</span>
                  <span className={styles.previewPrice}>
                    {price > 0 ? formatCurrency(price) : "—"}
                    {offerByRow[0] && Number(rows[0]?.mrp) > price && (
                      <s className={styles.previewMrp}>{formatCurrency(Number(rows[0].mrp))}</s>
                    )}
                  </span>
                  {/* Show size labels as chips if more than one variant */}
                  {rows.length > 1 && (
                    <div className={styles.previewSizes}>
                      {rows.map((r, i) => {
                        const colour = r.colour?.trim();
                        const size = r.label.trim();
                        const chipLabel = colour
                          ? size ? `${size} · ${colour}` : colour
                          : size || `Size ${i + 1}`;
                        return (
                          <span key={i} className={styles.previewSizeChip}>{chipLabel}</span>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {attempted && issue && (
          <p className={styles.issue} role="alert">
            {issue}
          </p>
        )}
        {error && (
          <p className={styles.issue} role="alert">
            {error}
          </p>
        )}

        <div className={styles.nav}>
          {step > 0 ? (
            <Button
              variant="secondary"
              onClick={() => {
                setAttempted(false);
                setStep((s) => s - 1);
              }}
              disabled={saving}
            >
              <ArrowLeft size={16} strokeWidth={2} aria-hidden="true" />
              Back
            </Button>
          ) : (
            <span />
          )}
          <Button variant="primary" onClick={goNext} disabled={saving}>
            {saving ? "Saving…" : isLast ? submitLabel : "Next"}
            {!isLast && !saving && <ArrowRight size={16} strokeWidth={2} aria-hidden="true" />}
          </Button>
        </div>
      </Card>

      {/* The long form is one link away from every step, and both write
          the same values — switching loses nothing. A guided flow that
          hides capability is a worse product for the person on their
          fortieth listing. */}
      <p className={styles.escape}>
        Done this before?{" "}
        <button type="button" className={styles.escapeLink} onClick={onSwitchToFull}>
          Use the full form instead
        </button>
        {" "}— everything you have typed carries over.
      </p>
    </div>
  );
}
