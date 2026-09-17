"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import {
  ArrowLeft,
  ArrowRight,
  Camera,
  Check,
  ChevronDown,
  Gift,
  IndianRupee,
  Plus,
  Tag,
  UtensilsCrossed,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Chip } from "@/components/ui/Chip";
import { Combobox, type ComboboxOption } from "@/components/ui/Combobox";
import { ImageUpload } from "@/components/ui/ImageUpload";
import { ImageSlot } from "@/components/placeholder/ImageSlot";
import { Textarea } from "@/components/ui/Textarea";
import { markupBreakdown, type CommissionRate } from "@/lib/commission";
import { formatCurrency } from "@/lib/format";
import type { DietaryTag, ProductKind, SellerCommission } from "@/lib/types";
import { DEFAULT_STOCK, type ListingFormValues, type ListingFormWeightRow } from "./ListingForm";
import { LISTING_LIMITS, VARIANT_LABEL_MAX, mergeVariantLabel, variantLabelError } from "@/lib/sell/listing-input";
import { ColourSwatches } from "./ColourSwatches";
import { parentForSuggestion } from "@/lib/taxonomy-actions";
import { buildShelfPicks } from "@/lib/sell/shelf-picks";
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
const FOOD_PLACEHOLDERS = ["e.g. Homemade pickle", "e.g. Freshly baked cookies", "e.g. Handcrafted sweets", "e.g. Traditional namkeen"];
const CRAFT_PLACEHOLDERS = ["e.g. Scented soy candle", "e.g. Handcrafted earrings", "e.g. Hand-painted illustration", "e.g. Macramé wall piece"];

/** How many top category quick-picks to show. */

// Colour swatches + their overflow guard: `lib/sell/listing-colours.ts`,
// shared with the long form so the two cannot drift.

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
      // Gifts are posted; only food asks how it travels (`toSellerListingInput`).
      shippingScope: kind === "craft" ? "national" : values.shippingScope,
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

  /** Every shelf on this side as chips, grouped, plus name matches (`lib/sell/shelf-picks`). */
  const shelfPicks = useMemo(
    () => buildShelfPicks(categories, values.kind, values.name),
    [categories, values.kind, values.name],
  );
  const hasShelfPicks = shelfPicks.groups.length > 0;
  const [showAllShelves, setShowAllShelves] = useState(false);
  const selectedShelfName = categories.find((c) => c.id === values.categoryId)?.name;
  /*
    A wall of thirty pills is a list nobody reads. The first run and any
    name matches are shown; the rest open on request — except a group
    holding the current pick, which stays open so a choice is never hidden.
  */
  const shelfSections = [
    ...(shelfPicks.suggested.length > 0
      ? [{ heading: "Matches the name" as string | null, shelves: shelfPicks.suggested, key: "suggested" }]
      : []),
    ...shelfPicks.groups.map((g, i) => ({ ...g, key: `${i}:${g.heading ?? "shelves"}` })),
  ];
  const leadCount = shelfPicks.suggested.length > 0 ? 2 : 1;
  const visibleShelfSections = shelfSections.filter(
    (section, i) =>
      showAllShelves ||
      i < leadCount ||
      section.shelves.some((cat) => cat.id === values.categoryId),
  );
  const hiddenShelfCount = shelfSections.length - visibleShelfSections.length;

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
    if (index === 3) {
      if (!values.description.trim()) {
        return "Write a line or two about it — this is what a buyer reads before deciding.";
      }
      if (values.fulfilment === "made_to_order" && !values.prepTimeMins.trim()) {
        return isCraft
          ? "Say how many days you need to make and send it."
          : "Say how much notice you need, in minutes.";
      }
      if (values.isPersonalisable && !values.personalisationPrompt.trim()) {
        return "Say what you want to ask the buyer for.";
      }
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

  // Default row for earnings preview. Absent/unloaded reads as "no fee" —
  // never a guessed rate: showing a 20% markup nobody has actually turned
  // on would tell a HomeKrafter a customer pays more than they will.
  const commissionRate: CommissionRate = {
    pct: commission?.pct ?? 0,
    gstPct: commission?.gstPct ?? 0,
    enabled: commission?.enabled ?? false,
  };
  const commPct = commissionRate.pct;
  const defaultRow = rows[0] ?? { price: "0" };
  const price = Number(defaultRow.price) || 0;
  const markup = markupBreakdown(price, commissionRate);

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
                {(
                  [
                    { kind: "food", title: "Something to eat", hint: "Pickles, sweets, cakes, snacks", Icon: UtensilsCrossed },
                    { kind: "craft", title: "Something to keep", hint: "Candles, jewellery, art, gifts", Icon: Gift },
                  ] as const
                ).map(({ kind, title, hint, Icon }) => {
                  const on = values.kind === kind;
                  return (
                    <button
                      key={kind}
                      type="button"
                      className={clsx(styles.choice, on && styles.choiceOn)}
                      onClick={() => setKind(kind)}
                      aria-pressed={on}
                    >
                      <span className={styles.choiceIcon} aria-hidden="true">
                        <Icon size={20} strokeWidth={1.8} />
                      </span>
                      <span className={styles.choiceText}>
                        <span className={styles.choiceTitle}>{title}</span>
                        <span className={styles.choiceHint}>{hint}</span>
                      </span>
                      <span className={styles.choiceTick} aria-hidden="true">
                        {on && <Check size={14} strokeWidth={2.4} />}
                      </span>
                    </button>
                  );
                })}
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

            <div className={styles.shelfBlock}>
              <div className={styles.shelfTop}>
                <span id="shelf-question" className={styles.question}>
                  Which shelf does it belong on?
                </span>
                {selectedShelfName && (
                  <span className={styles.shelfChosen} aria-live="polite">
                    <Check size={14} strokeWidth={2.4} aria-hidden="true" />
                    {selectedShelfName}
                  </span>
                )}
              </div>

              {/*
                The shelf list is filtered to the side of the catalogue
                they just picked, so a candle maker is never offered
                "Pickles" — and the ask carries that same answer, so an
                approved shelf lands on the right half without an admin
                having to guess at what somebody meant. Search sits first:
                typing a word is quicker than scanning a list.
              */}
              <Combobox
                label="Search shelves"
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

              {hasShelfPicks && (
                <div className={styles.shelfPanel} role="group" aria-labelledby="shelf-question">
                  {visibleShelfSections.map((group) => (
                    <div key={group.key} className={styles.shelfGroup}>
                      {group.heading && <span className={styles.shelfHeading}>{group.heading}</span>}
                      <div className={styles.quickPicks}>
                        {group.shelves.map((cat) => {
                          const on = values.categoryId === cat.id;
                          return (
                            <button
                              key={cat.id}
                              type="button"
                              aria-pressed={on}
                              className={clsx(styles.quickPick, on && styles.quickPickSelected)}
                              onClick={() => set("categoryId", cat.id)}
                            >
                              {on && <Check size={14} strokeWidth={2.4} aria-hidden="true" />}
                              {cat.name}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                  {(hiddenShelfCount > 0 || showAllShelves) && shelfSections.length > leadCount && (
                    <button
                      type="button"
                      className={styles.shelfMore}
                      aria-expanded={showAllShelves}
                      onClick={() => setShowAllShelves((open) => !open)}
                    >
                      {showAllShelves ? "Show fewer shelves" : `Browse all shelves (${hiddenShelfCount} more ${hiddenShelfCount === 1 ? "group" : "groups"})`}
                      <ChevronDown
                        size={16}
                        strokeWidth={1.8}
                        aria-hidden="true"
                        className={clsx(styles.shelfMoreIcon, showAllShelves && styles.shelfMoreIconOpen)}
                      />
                    </button>
                  )}
                </div>
              )}
            </div>
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
                        {/*
                          One picker, shared with the long form
                          (`ColourSwatches`) — the palette, the 40-character
                          guard and the tick contrast all live in
                          `lib/sell/listing-colours.ts` now. This block used
                          to hold its own copy of each, which is how the
                          long form ended up offering a bare text box
                          instead.
                        */}
                        <ColourSwatches
                          size={row.label}
                          value={row.colour}
                          onChange={(next) => updateRow(index, { colour: next })}
                        />
                        <input
                          className={styles.bigInput}
                          value={row.colour ?? ""}
                          onChange={(event) => updateRow(index, { colour: event.target.value })}
                          placeholder="e.g. Rose gold, Matte black, Ivory"
                        />
                        <span className={styles.fieldHint}>
                          Select multiple colours or type them separated by commas.
                        </span>
                        {/*
                          The limit is shown where the label is built, not at
                          Submit. Before this the only signal was the server's
                          field path at the bottom of the form, after every
                          other answer had been typed.
                        */}
                        {(() => {
                          const problem = variantLabelError(row.label, row.colour);
                          if (problem) {
                            return (
                              <span className={styles.fieldError} role="alert">
                                {problem}
                              </span>
                            );
                          }
                          const used = mergeVariantLabel(row.label, row.colour).length;
                          if (used > VARIANT_LABEL_MAX - 10) {
                            return (
                              <span className={styles.fieldHint}>
                                {VARIANT_LABEL_MAX - used} characters left on this
                                option&rsquo;s label. Need more colours? Add another
                                option.
                              </span>
                            );
                          }
                          return null;
                        })()}
                      </label>
                    )}

                  </div>

                  <div className={styles.variantPriceRow}>
                    <label className={styles.field}>
                      <span className={styles.question}>What do you want to receive?</span>
                      <div className={styles.moneyRow}>
                        <IndianRupee size={18} strokeWidth={2} aria-hidden="true" className={styles.rupee} />
                        <input
                          className={styles.bigInput}
                          type="number"
                          inputMode="numeric"
                          min={0}
                          value={row.price}
                          onChange={(event) => updateRow(index, { price: event.target.value })}
                          placeholder="100"
                        />
                      </div>
                      <span className={styles.fieldHint}>
                        {commissionRate.enabled
                          ? `Your payout. Platform commission (+${commPct}%, plus GST) is added for the customer.`
                          : "Your payout. Nothing is added for the customer right now."}
                      </span>
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

                  {index === 0 && price > 0 && commissionRate.enabled && (
                    <div className={styles.commissionBox}>
                      <div className={styles.commissionRow}>
                        <span className={styles.commissionLabel}>You receive (your payout)</span>
                        <span className={styles.commissionValue}>{formatCurrency(markup.sellerWants)}</span>
                      </div>
                      <div className={styles.commissionRow}>
                        <span className={styles.commissionLabel}>
                          Platform commission (+{commPct}%)
                        </span>
                        <span className={styles.commissionAdd}>
                          +{formatCurrency(markup.commission)}
                        </span>
                      </div>
                      {markup.gst > 0 && (
                        <div className={styles.commissionRow}>
                          <span className={styles.commissionLabel}>GST on commission</span>
                          <span className={styles.commissionAdd}>+{formatCurrency(markup.gst)}</span>
                        </div>
                      )}
                      <div className={clsx(styles.commissionRow, styles.commissionTotal)}>
                        <span className={styles.commissionLabel}>Listing price for customer</span>
                        <span className={styles.commissionValue}>{formatCurrency(markup.customerPrice)}</span>
                      </div>
                      <div className={styles.commissionHintNote}>
                        It’ll be {formatCurrency(markup.customerPrice)} for the customer, all fees included.
                      </div>
                    </div>
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
                  ? "Describe materials, technique, dimensions, and care instructions (e.g. Hand-poured soy candle with cotton wick)."
                  : "Describe ingredients, flavor, texture, preparation method, and how it is best enjoyed."
              }
            />
            <div className={styles.charCount}>
              {values.description.length} / ~200 characters — two or three sentences is plenty
            </div>

            {!isCraft && (
              <div className={styles.craftSpecsGroup}>
                <p className={styles.craftSpecsHint}>
                  Food safety, allergens &amp; shelf life details (required for food approval).
                </p>
                <label className={styles.field}>
                  <span className={styles.question}>
                    Ingredients <span style={{ color: "var(--hk-terracotta, #b45309)", fontWeight: 600 }}>required</span>
                  </span>
                  <input
                    className={styles.bigInput}
                    value={values.ingredients ?? ""}
                    onChange={(event) => set("ingredients", event.target.value)}
                    placeholder="e.g. Roasted peanuts, jaggery, cardamom, ghee"
                    required
                  />
                </label>
                <div className={styles.craftSpecsGrid}>
                  <label className={styles.field}>
                    <span className={styles.question}>
                      Shelf life <span style={{ color: "var(--hk-terracotta, #b45309)", fontWeight: 600 }}>required</span>
                    </span>
                    <input
                      className={styles.bigInput}
                      value={values.shelfLife ?? ""}
                      onChange={(event) => set("shelfLife", event.target.value)}
                      placeholder="e.g. 30 days from dispatch"
                      required
                    />
                  </label>
                  <label className={styles.field}>
                    <span className={styles.question}>
                      Serving guidance <span className={styles.optional}>optional</span>
                    </span>
                    <input
                      className={styles.bigInput}
                      value={values.servingGuidance ?? ""}
                      onChange={(event) => set("servingGuidance", event.target.value)}
                      placeholder="e.g. Serves 1–2 / Pack of 6"
                    />
                  </label>
                </div>
                <label className={styles.field}>
                  <span className={styles.question}>
                    Storage instructions <span className={styles.optional}>recommended</span>
                  </span>
                  <input
                    className={styles.bigInput}
                    value={values.storageInstructions ?? ""}
                    onChange={(event) => set("storageInstructions", event.target.value)}
                    placeholder="e.g. Store in an airtight container away from direct sunlight"
                  />
                </label>
              </div>
            )}

            {isCraft && (
              <div className={styles.craftSpecsGroup}>
                <p className={styles.craftSpecsHint}>
                  Help buyers know exactly what they&apos;re getting.
                </p>
                <div className={styles.craftSpecsGrid}>
                  <label className={styles.field}>
                    <span className={styles.question}>
                      Dimensions <span className={styles.optional}>optional</span>
                    </span>
                    <input
                      className={styles.bigInput}
                      value={values.dimensions}
                      onChange={(event) => set("dimensions", event.target.value)}
                      placeholder="e.g. 15 × 10 × 5 cm"
                    />
                  </label>
                  <label className={styles.field}>
                    <span className={styles.question}>
                      Material <span className={styles.optional}>optional</span>
                    </span>
                    <input
                      className={styles.bigInput}
                      value={values.material}
                      onChange={(event) => set("material", event.target.value)}
                      placeholder="e.g. 100% Soy Wax, Cotton wick"
                    />
                  </label>
                </div>
                <label className={styles.field}>
                  <span className={styles.question}>
                    Care instructions <span className={styles.optional}>optional</span>
                  </span>
                  <input
                    className={styles.bigInput}
                    value={values.careInstructions}
                    onChange={(event) => set("careInstructions", event.target.value)}
                    placeholder="e.g. Keep away from direct sunlight, hand wash only"
                  />
                </label>
              </div>
            )}

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

            {/* Food only: a gift is always posted (`toSellerListingInput`). */}
            {values.kind === "food" && (
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
            )}

            {/*
              Ready to ship, or made to order (G1, 2026-09-16) — asked of
              food and craft alike, same question the long form asks. Left
              unanswered by default rather than defaulted to "ready to
              ship": a listing nobody has told us about gets no delivery
              promise, not a guessed one.
            */}
            <fieldset className={styles.choiceSet}>
              <legend className={styles.question}>Ready to ship, or made to order?</legend>
              <div className={styles.choices}>
                <button
                  type="button"
                  className={clsx(styles.choice, values.fulfilment === "ready_to_ship" && styles.choiceOn)}
                  onClick={() => set("fulfilment", "ready_to_ship")}
                  aria-pressed={values.fulfilment === "ready_to_ship"}
                >
                  <span className={styles.choiceTitle}>Ready to ship</span>
                  <span className={styles.choiceHint}>You already have it, no special notice needed</span>
                </button>
                <button
                  type="button"
                  className={clsx(styles.choice, values.fulfilment === "made_to_order" && styles.choiceOn)}
                  onClick={() => set("fulfilment", "made_to_order")}
                  aria-pressed={values.fulfilment === "made_to_order"}
                >
                  <span className={styles.choiceTitle}>Made to order</span>
                  <span className={styles.choiceHint}>
                    {isCraft ? "You make each one once it's bought" : "You need advance notice to cook it"}
                  </span>
                </button>
              </div>
            </fieldset>

            {values.fulfilment === "made_to_order" && (
              <label className={styles.field}>
                <span className={styles.question}>
                  {isCraft ? "How many days to make and send it?" : "How much notice do you need, in minutes?"}
                </span>
                <input
                  className={styles.bigInput}
                  type="number"
                  inputMode="numeric"
                  min={1}
                  value={values.prepTimeMins}
                  onChange={(event) => set("prepTimeMins", event.target.value)}
                  placeholder={isCraft ? "e.g. 3" : "e.g. 120"}
                />
              </label>
            )}

            <label className={styles.checkRow}>
              <input
                type="checkbox"
                checked={values.isPersonalisable}
                onChange={(event) => set("isPersonalisable", event.target.checked)}
              />
              <span>Can the buyer ask for a personal touch? (name, colour, message)</span>
            </label>

            {values.isPersonalisable && (
              <label className={styles.field}>
                <span className={styles.question}>What should we ask them for?</span>
                <input
                  className={styles.bigInput}
                  value={values.personalisationPrompt}
                  onChange={(event) => set("personalisationPrompt", event.target.value)}
                  placeholder='e.g. "Which colour would you like?"'
                  maxLength={LISTING_LIMITS.personalisationPrompt}
                />
              </label>
            )}

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
                    {markup.customerPrice > 0 ? formatCurrency(markup.customerPrice) : "—"}
                    {offerByRow[0] && Number(rows[0]?.mrp) > markup.customerPrice && (
                      <s className={styles.previewMrp}>{formatCurrency(Number(rows[0].mrp))}</s>
                    )}
                  </span>
                  {price > 0 && (
                    <span className={styles.previewPayoutNote}>
                      Your payout: {formatCurrency(price)}
                    </span>
                  )}
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
