"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import { ArrowLeft, ArrowRight, Camera, Check, IndianRupee, Tag } from "lucide-react";
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
import { DEFAULT_STOCK, type ListingFormValues } from "./ListingForm";
import { parentForSuggestion } from "@/lib/taxonomy-actions";
import type { ListingTaxonomyActions } from "@/lib/taxonomy-actions";
import styles from "./GuidedListingForm.module.css";

const DIETARY_OPTIONS: { value: DietaryTag; label: string }[] = [
  { value: "vegetarian", label: "Vegetarian" },
  { value: "vegan", label: "Vegan" },
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
  const [onOffer, setOnOffer] = useState(() => {
    const row = values.weightRows[0];
    return Boolean(row?.mrp && Number(row.mrp) > Number(row.price));
  });
  const headingRef = useRef<HTMLHeadingElement>(null);
  const headingId = useId();

  const isCraft = values.kind === "craft";
  const row = values.weightRows[0] ?? { label: "", price: "", mrp: "", stock: "" };

  function set<K extends keyof ListingFormValues>(key: K, value: ListingFormValues[K]) {
    onChange({ ...values, [key]: value });
  }

  function setRow(patch: Partial<typeof row>) {
    const next = [...values.weightRows];
    next[0] = { ...row, ...patch };
    onChange({ ...values, weightRows: next });
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
      if (!row.price || Number(row.price) <= 0) return "Put in a price.";
      if (onOffer && Number(row.mrp) <= Number(row.price)) {
        return "The usual price has to be higher than the offer price.";
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
      const filled = [...values.weightRows];
      filled[0] = {
        ...row,
        label: row.label.trim() || DEFAULT_SIZE_LABEL,
        // Not on offer means MRP *is* the price. Leaving it at 0 would
        // render a strikethrough against nothing; inflating it would
        // invent a discount the cook never offered.
        mrp: onOffer ? row.mrp : row.price,
        stock: row.stock.trim() || String(DEFAULT_STOCK),
      };
      const finished = { ...values, weightRows: filled };
      onChange(finished);
      onSubmit(finished);
      return;
    }
    setStep((s) => s + 1);
  }

  const price = Number(row.price) || 0;
  const breakdown = commissionBreakdown(price, commission?.pct ?? 0);

  return (
    <div className={styles.wrap}>
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
              {index < step ? <Check size={12} strokeWidth={2.6} /> : index + 1}
            </span>
            <span className={styles.progressLabel}>{s.title}</span>
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
          <div className={styles.stepBody}>
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
          <div className={styles.stepBody}>
            <fieldset className={styles.choiceSet}>
              <legend className={styles.question}>Is it something to eat, or something to keep?</legend>
              <div className={styles.choices}>
                <button
                  type="button"
                  className={clsx(styles.choice, !isCraft && styles.choiceOn)}
                  onClick={() => setKind("food")}
                  aria-pressed={!isCraft}
                >
                  <span className={styles.choiceTitle}>Something to eat</span>
                  <span className={styles.choiceHint}>Pickles, sweets, cakes, snacks</span>
                </button>
                <button
                  type="button"
                  className={clsx(styles.choice, isCraft && styles.choiceOn)}
                  onClick={() => setKind("craft")}
                  aria-pressed={isCraft}
                >
                  <span className={styles.choiceTitle}>Something to keep</span>
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
                placeholder={isCraft ? "Beeswax candle, small" : "Mango thokku pickle"}
              />
            </label>

            {/*
              The shelf list is filtered to the side of the catalogue
              they just picked, so a candle maker is never offered
              "Pickles" — and the ask carries that same answer, so an
              approved shelf lands on the right half without an admin
              having to guess at what somebody meant.
            */}
            <Combobox
              label="Which shelf does it belong on?"
              labelTone="plain"
              value={values.categoryId ? [values.categoryId] : []}
              onChange={(next) => set("categoryId", next[0] ?? "")}
              options={categoryOptions}
              placeholder="Start typing…"
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
          <div className={styles.stepBody}>
            <label className={styles.field}>
              <span className={styles.question}>How much for one?</span>
              <div className={styles.moneyRow}>
                <IndianRupee size={18} strokeWidth={2} aria-hidden="true" className={styles.rupee} />
                <input
                  className={styles.bigInput}
                  type="number"
                  inputMode="numeric"
                  min={0}
                  value={row.price}
                  onChange={(event) => setRow({ price: event.target.value })}
                  placeholder="249"
                />
              </div>
              {commission?.enabled && price > 0 && (
                <span className={styles.help}>
                  You receive {formatCurrency(breakdown.net)} of that; the rest is the platform
                  fee.
                </span>
              )}
            </label>

            <label className={styles.field}>
              <span className={styles.question}>How many can you make right now?</span>
              <input
                className={styles.bigInput}
                type="number"
                inputMode="numeric"
                min={0}
                value={row.stock}
                onChange={(event) => setRow({ stock: event.target.value })}
                placeholder="10"
              />
              <span className={styles.help}>
                A rough number is fine. You can change it any day, and mark the listing sold out
                in one tap.
              </span>
            </label>

            <label className={styles.field}>
              <span className={styles.question}>
                What size is that? <span className={styles.optional}>optional</span>
              </span>
              <input
                className={styles.bigInput}
                value={row.label}
                onChange={(event) => setRow({ label: event.target.value })}
                placeholder={isCraft ? "Small" : "250 g"}
              />
              <span className={styles.help}>
                Leave it empty and we will just call it “{DEFAULT_SIZE_LABEL}”. More sizes can be
                added later from the full form.
              </span>
            </label>

            <label className={styles.checkRow}>
              <input
                type="checkbox"
                checked={onOffer}
                onChange={(event) => {
                  setOnOffer(event.target.checked);
                  if (!event.target.checked) setRow({ mrp: row.price });
                }}
              />
              <span>It is on offer — show a crossed-out higher price</span>
            </label>
            {onOffer && (
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
                    onChange={(event) => setRow({ mrp: event.target.value })}
                    placeholder="299"
                  />
                </div>
              </label>
            )}
          </div>
        )}

        {step === 3 && (
          <div className={styles.stepBody}>
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
            <p className={styles.help}>
              Two or three sentences is plenty. What is in it, how you make it, how long it
              keeps.
            </p>

            {!isCraft && (
              <fieldset className={styles.choiceSet}>
                <legend className={styles.question}>
                  Anything a buyer should know? <span className={styles.optional}>optional</span>
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
                    {onOffer && Number(row.mrp) > price && (
                      <s className={styles.previewMrp}>{formatCurrency(Number(row.mrp))}</s>
                    )}
                  </span>
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
