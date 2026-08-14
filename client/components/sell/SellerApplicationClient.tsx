"use client";

import { useState } from "react";
import Link from "next/link";
import clsx from "clsx";
import { Store } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { Textarea } from "@/components/ui/Textarea";
import { isPincodeShape } from "@/lib/pincode";
import { usePincodeLookup } from "@/lib/use-pincode-lookup";
import {
  SPECIALTY_GROUPS,
  SPECIALTY_LABELS,
  makesFood,
  type SellerSpecialty,
} from "@/lib/types";
import {
  businessNameError,
  contactNameError,
  emailError,
  fssaiError,
  instagramError,
  phoneError,
  websiteError,
} from "@/lib/sell/application-fields";
import { createSellerApplication, type CreateSellerApplicationInput } from "@/lib/api";
import { useAuth } from "@/lib/auth/AuthContext";
import { ApiError } from "@/lib/api/http";
import type { SellerApplication } from "@/lib/types";
import type { SellerBenefit, SellerStep } from "@/lib/data";
import styles from "./SellerApplicationClient.module.css";

export interface SellerApplicationClientProps {
  benefits: SellerBenefit[];
  steps: SellerStep[];
}

const EMPTY_FORM = {
  businessName: "",
  contactName: "",
  email: "",
  phone: "",
  /**
   * Where they work from (M36) — any Indian pincode. Replaced a dropdown
   * of 21 tricity areas whose "Somewhere else" option filed an
   * application nobody could ever approve.
   */
  pincode: "",
  /**
   * Kept as a string because it comes off a `<select>`; parsed on submit.
   * **Empty means "they didn't say"**, which is what lets the platform
   * default apply at approval — so this starts empty, not at "10".
   */
  deliveryRadiusKm: "",
  description: "",
  // M32 — the questions that make an application decidable rather than
  // just receivable. All optional: a form that demands proof before it
  // will take an application turns away the person who has none yet.
  instagramUrl: "",
  websiteUrl: "",
  /** Only asked of somebody who says they make food. */
  fssaiNumber: "",
  /** Strings because they come off inputs; parsed on submit. Empty is "didn't say", never 0. */
  yearsMaking: "",
  capacityPerDay: "",
};

const RADIUS_OPTIONS = [3, 5, 8, 10, 15, 20, 30];

/**
 * Sell on Homekrafted — seller-onboarding info + a real, submittable
 * application form. **Real as of M9**: `createSellerApplication` posts to
 * `POST /seller-applications`, which lands in the actual admin approval
 * queue (`/admin/sellers` → "Approval queue") — an approved application
 * becomes a live `Seller` + storefront a real person can log into. No
 * longer future-flagged (see `docs/PRD.md`'s M7b-era "future" note, now
 * superseded).
 */
export function SellerApplicationClient({ benefits, steps }: SellerApplicationClientProps) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [specialties, setSpecialties] = useState<SellerSpecialty[]>(["homemade_food"]);
  const [radiusOpen, setRadiusOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [application, setApplication] = useState<SellerApplication | null>(null);

  // Whether the visitor is already an approved HomeKrafter — see the
  // notice this drives, inside the form card.
  const { role, seller } = useAuth();
  const alreadySelling = role === "seller" && !!seller;

  function set<K extends keyof typeof EMPTY_FORM>(key: K, value: string) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  const sellsFood = makesFood(specialties);

  /**
   * Where they work from — **a pincode, anywhere in India (M36).**
   *
   * This box used to be a dropdown of 21 curated tricity areas plus
   * "somewhere else". "Somewhere else" filed a waitlist entry that
   * `approveApplication` refused and no screen could resolve, so a real
   * home cook in Faridabad applied, was accepted by the form, and could
   * never be approved by anybody. A pincode has no such dead end: every
   * valid one resolves, so every application is decidable.
   *
   * Whether we *deliver* to that pincode yet is a different question,
   * and it is deliberately not asked here — gating who may apply on
   * where we currently deliver is exactly the bug being removed. The
   * lookup's `serviced` flag is ignored on this form.
   *
   * The city is still derived rather than asked (M32's rule, now with a
   * better source): India Post's district beats a second box that
   * disagrees with the first.
   */
  const lookup = usePincodeLookup(form.pincode);
  const city = lookup.data?.district ?? "";

  // Shown under a field once it has been left, not while it is being
  // typed: flagging "at least 2 characters" at the first keystroke is the
  // form arguing with somebody who is halfway through their own name.
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const touch = (key: string) => setTouched((t) => ({ ...t, [key]: true }));

  const fieldErrors: Record<string, string | null> = {
    businessName: businessNameError(form.businessName),
    contactName: contactNameError(form.contactName),
    email: emailError(form.email),
    phone: phoneError(form.phone),
    instagramUrl: instagramError(form.instagramUrl),
    websiteUrl: websiteError(form.websiteUrl),
    fssaiNumber: sellsFood ? fssaiError(form.fssaiNumber) : null,
  };
  const hasFieldError = Object.values(fieldErrors).some(Boolean);

  const valid =
    form.businessName.trim().length > 0 &&
    form.contactName.trim().length > 0 &&
    form.email.trim().length > 0 &&
    form.phone.trim().length > 0 &&
    // Shape only, and deliberately not "the lookup succeeded" (M36). The
    // client stays looser than the server for the same reason the two
    // identifier parsers do: a lookup that failed because our own API was
    // unreachable must not disable the button on somebody whose pincode
    // is perfectly valid. The server checks existence again and answers
    // with a message naming the pincode.
    isPincodeShape(form.pincode) &&
    // At least one specialty: it is how buyers find them at all.
    specialties.length > 0 &&
    form.description.trim().length > 0 &&
    // Nothing typed may be *wrong* — an empty optional field is fine, a
    // malformed one is not.
    !hasFieldError;

  /**
   * This used to be `try { … } finally { setBusy(false) }` with no `catch`.
   * Every failure was invisible: the button simply re-enabled and the
   * applicant was told nothing. `POST /seller-applications` is throttled at
   * 5/60s, so the realistic sequence was submit-fails, nothing happens,
   * click again, hit the throttle, still nothing, leave.
   */
  async function handleSubmit() {
    if (!valid || busy) return;
    setBusy(true);
    setError(null);
    try {
      const input: CreateSellerApplicationInput = {
        businessName: form.businessName.trim(),
        contactName: form.contactName.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
        // No `category` (M22). The server derives it from `specialties`,
        // so the form no longer asks a taxonomy question whose only
        // consumer was a column nothing renders.
        specialties,
        // Sent as a courtesy for a server that could not resolve the
        // pincode; the server prefers India Post's district over it.
        city: city.trim(),
        pincode: form.pincode.trim(),
        // Undefined, not 0 or 10 — an omitted radius is what lets the
        // platform default apply at approval.
        deliveryRadiusKm: form.deliveryRadiusKm ? Number(form.deliveryRadiusKm) : undefined,
        description: form.description.trim(),
        // Empty stays undefined all the way down: "didn't say" is a state
        // the admin screens render, and it is not the same as zero.
        instagramUrl: form.instagramUrl.trim() || undefined,
        websiteUrl: form.websiteUrl.trim() || undefined,
        fssaiNumber: sellsFood && form.fssaiNumber.trim() ? form.fssaiNumber.trim() : undefined,
        yearsMaking: form.yearsMaking ? Number(form.yearsMaking) : undefined,
        capacityPerDay: form.capacityPerDay ? Number(form.capacityPerDay) : undefined,
      };
      const created = await createSellerApplication(input);
      setApplication(created);
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 429
          ? "That was a lot of attempts in a row. Wait a minute and try again."
          : err instanceof ApiError && err.message
            ? err.message
            : "We couldn't submit your application just now. Check your connection and try again — nothing was lost.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={clsx("container", styles.page)}>
      <div className={styles.header}>
        <h1 className={styles.title}>Sell on Homekrafted</h1>
        <p className={styles.subtitle}>
          Tell us about what you make — our team reviews every application and reaches out once
          yours is approved.
        </p>
      </div>

      <div className={styles.benefits}>
        {benefits.map((benefit) => (
          <Card key={benefit.title} className={styles.benefitCard}>
            <span className={styles.benefitTitle}>{benefit.title}</span>
            <span className={styles.benefitCopy}>{benefit.description}</span>
          </Card>
        ))}
      </div>

      <Card className={styles.stepsCard}>
        <span className={styles.sectionLabel}>How it works</span>
        <div className={styles.steps}>
          {steps.map((step, index) => (
            <div key={step.title} className={styles.step}>
              <span className={styles.stepIndex}>{index + 1}</span>
              <div>
                <div className={styles.stepTitle}>{step.title}</div>
                <div className={styles.stepCopy}>{step.description}</div>
              </div>
            </div>
          ))}
        </div>
      </Card>

      {application ? (
        <Card className={styles.confirmationCard}>
          {/*
            Two confirmations, because there are two outcomes. An "other"
            area cannot be approved as-is, so promising "a decision" would
            be a promise the system has already decided not to keep — the
            applicant would wait for an email that never comes.
          */}
          <span className={styles.confirmationBadge}>
            {application.areaLabel ? "You're on the list" : "Application submitted"}
          </span>
          <p className={styles.confirmationTitle}>Thanks, {application.contactName.split(" ")[0]}!</p>
          {application.areaLabel ? (
            <p className={styles.confirmationCopy}>
              We don&rsquo;t deliver in <b>{application.areaLabel}</b> yet, so we can&rsquo;t open{" "}
              <b>{application.businessName}</b> today. We&rsquo;ve saved your details and we&rsquo;ll
              email {application.email} when we start delivering there.
            </p>
          ) : (
            <p className={styles.confirmationCopy}>
              {/*
                `{" "}` rather than a plain space before `and`: JSX drops the
                whitespace that sits between an element and a line break, so
                the version without it rendered "for Test Kitchen QAand it's
                now under review". Same fix the waitlist branch above already
                uses — don't "tidy" it back into a bare space.
              */}
              We&rsquo;ve received your application for <b>{application.businessName}</b>{" "}
              and it&rsquo;s now under review. We&rsquo;ll email {application.email} once a
              decision is made.
            </p>
          )}
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              setApplication(null);
              setForm(EMPTY_FORM);
            }}
          >
            Submit another application
          </Button>
        </Card>
      ) : (
        <Card className={styles.formCard}>
          <div className={styles.formHeader}>
            <Store size={20} strokeWidth={1.6} aria-hidden="true" />
            <span>Apply to sell</span>
          </div>

          {/*
            M33 — the other half of "register for gifting under the same
            account". An approved HomeKrafter who wants to add a category
            arrives here, because this is the page that is signposted
            everywhere as how you start selling, and filling it in a second
            time is exactly the wrong move: it produces a duplicate
            application for an admin to reconcile (M31 added duplicate
            flagging because these accumulate) and, if approved, a second
            `Vendor` that splits one kitchen's reviews, followers and
            payouts in two.

            Told, not blocked. The form still works — somebody may be
            applying on behalf of a different business, and a hard
            redirect would strand them with no way through.
          */}
          {alreadySelling && (
            <p className={styles.alreadySelling}>
              You already sell on Homekrafted. To add gifting or another category, don&rsquo;t
              apply again — open{" "}
              <Link href="/seller/profile">what you make, in your profile</Link>. It is the same
              account, and it takes effect straight away.
            </p>
          )}

          <div className={styles.formGrid}>
            <TextField
              label="Business / maker name"
              help="The name buyers will see on your storefront."
              value={form.businessName}
              onChange={(v) => set("businessName", v)}
              onBlur={() => touch("businessName")}
              error={touched.businessName ? fieldErrors.businessName : null}
              required
            />
            <TextField
              label="Your name"
              value={form.contactName}
              onChange={(v) => set("contactName", v)}
              onBlur={() => touch("contactName")}
              error={touched.contactName ? fieldErrors.contactName : null}
              required
            />
            <TextField
              label="Email"
              type="email"
              help="We send your sign-in details here."
              value={form.email}
              onChange={(v) => set("email", v)}
              onBlur={() => touch("email")}
              error={touched.email ? fieldErrors.email : null}
              required
            />
            <TextField
              label="Mobile number"
              type="tel"
              help="Someone from the team may call you about your application."
              value={form.phone}
              onChange={(v) => set("phone", v)}
              onBlur={() => touch("phone")}
              error={touched.phone ? fieldErrors.phone : null}
              required
            />
            {/*
              One box, and it works anywhere in India (M36).

              It replaced a dropdown of 21 tricity areas plus "Somewhere
              else", where "Somewhere else" revealed two more inputs and
              filed a waitlist entry that could never be approved. A home
              cook outside Chandigarh was accepted by this form and then
              stuck forever. A pincode has no such branch: every valid one
              resolves, so there is one field, no conditional, and no dead
              end.

              Note what is NOT asked: whether we deliver there. Applying is
              national; delivery is not yet. Mixing the two is the bug that
              was removed.
            */}
            <label className={styles.field}>
              <span className={styles.fieldLabel}>What&rsquo;s your pincode?</span>
              <input
                className={styles.input}
                value={form.pincode}
                onChange={(event) =>
                  // Digits only, capped at six: a pincode has no other
                  // shape, so silently dropping the rest beats an error
                  // message about a character we could simply not accept.
                  set("pincode", event.target.value.replace(/\D/g, "").slice(0, 6))
                }
                onBlur={() => touch("pincode")}
                inputMode="numeric"
                autoComplete="postal-code"
                placeholder="e.g. 160017"
                aria-describedby="pincode-help"
                required
              />
              {/*
                The echo is the only confirmation available on a form with
                no address lookup — seeing "Panchkula, Haryana" catches a
                transposed pair in a way re-reading six digits does not.
                `aria-live` because it changes without any focus moving.
              */}
              <span id="pincode-help" className={styles.fieldHelp} aria-live="polite">
                {lookup.loading && "Checking…"}
                {lookup.data && `We'll list you in ${lookup.data.district}, ${lookup.data.state}.`}
                {/* Their problem, phrased as theirs. */}
                {lookup.unknown &&
                  "We don't recognise that pincode. Check it against the address you post from."}
                {/* Ours, and never phrased as theirs — see docs/ERROR-HANDLING.md.
                    The application still submits: the server checks the
                    pincode again, so a failed lookup must not block a
                    valid applicant. */}
                {lookup.unreachable &&
                  "We couldn't check that pincode just now — you can still send your application."}
                {!lookup.loading &&
                  !lookup.data &&
                  !lookup.unknown &&
                  !lookup.unreachable &&
                  "Wherever you are in India. This is what places you on the map for nearby buyers."}
              </span>
            </label>

            {/*
              Progressive disclosure, and deliberately NOT pre-filled with the
              platform default. `PUBLIC_SETTING_KEYS` is empty by design
              (`server/src/admin/settings.service.ts`) — `defaultDeliveryRadiusKm`
              is not public, so this page cannot read it. Left blank, the
              application stores NULL and approval applies the platform value.
            */}
            <div className={styles.field}>
              <button
                type="button"
                className={styles.disclosureTrigger}
                aria-expanded={radiusOpen}
                aria-controls="delivery-radius-panel"
                onClick={() => setRadiusOpen((open) => !open)}
              >
                {form.deliveryRadiusKm
                  ? `Delivering up to ${form.deliveryRadiusKm} km · Change`
                  : "Set a delivery distance (optional)"}
              </button>
              <div id="delivery-radius-panel" hidden={!radiusOpen}>
                <select
                  className={styles.input}
                  value={form.deliveryRadiusKm}
                  onChange={(event) => set("deliveryRadiusKm", event.target.value)}
                >
                  <option value="">Let Homekrafted choose for me</option>
                  {RADIUS_OPTIONS.map((km) => (
                    <option key={km} value={String(km)}>
                      Up to {km} km
                    </option>
                  ))}
                </select>
                <span className={styles.fieldHelp}>
                  Leave this alone and we&rsquo;ll set a sensible distance for your area. You can
                  change it later from your storefront settings.
                </span>
              </div>
            </div>
            {/* One question about what they make, grouped rather than a
                flat wall of eighteen chips, and even-handed across the two
                halves of the marketplace.

                The separate "Category" question that used to sit below
                this is gone (M22). It asked every applicant to file
                themselves as a maker/baker/artist/home chef before they
                could say what they actually made — a food-shaped taxonomy
                that sent a candle maker to "other" — and its only purpose
                was to pick a `VendorType` that is rendered on no screen.
                The server derives both from these chips now. */}
            <div className={styles.field}>
              <span className={styles.fieldLabel}>What do you make?</span>
              <span className={styles.fieldHelp}>
                Pick everything that applies — it&rsquo;s how buyers find you. You can sell
                anything homemade here, and you can change this later.
              </span>
              {SPECIALTY_GROUPS.map((group) => (
                <div key={group.label} className={styles.specialtyGroup}>
                  <span className={styles.specialtyGroupLabel}>{group.label}</span>
                  <div className={styles.chipRow}>
                    {group.values.map((option) => (
                      <Chip
                        key={option}
                        label={SPECIALTY_LABELS[option]}
                        selected={specialties.includes(option)}
                        onClick={() =>
                          setSpecialties((current) =>
                            current.includes(option)
                              ? current.filter((x) => x !== option)
                              : [...current, option],
                          )
                        }
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/*
            Where we can see the work, and how much of it there is (M32).
            Everything here is optional — a form that demands proof before
            it will take an application turns away the person who has none
            yet — but between them these are what turn "somebody applied"
            into "somebody an admin can make a decision about".
          */}
          <div className={styles.formGrid}>
            <TextField
              label="Instagram"
              placeholder="@your.kitchen"
              help="The fastest way for us to see what you make."
              value={form.instagramUrl}
              onChange={(v) => set("instagramUrl", v)}
              onBlur={() => touch("instagramUrl")}
              error={touched.instagramUrl ? fieldErrors.instagramUrl : null}
            />
            <TextField
              label="Website or shop link"
              placeholder="yourshop.com"
              value={form.websiteUrl}
              onChange={(v) => set("websiteUrl", v)}
              onBlur={() => touch("websiteUrl")}
              error={touched.websiteUrl ? fieldErrors.websiteUrl : null}
            />
            <TextField
              label="Years making this"
              inputMode="numeric"
              placeholder="e.g. 3"
              value={form.yearsMaking}
              onChange={(v) => set("yearsMaking", v.replace(/\D/g, "").slice(0, 2))}
            />
            <TextField
              label="Orders a day you can take"
              inputMode="numeric"
              placeholder="e.g. 10"
              help="A rough number. You can change it any time."
              value={form.capacityPerDay}
              onChange={(v) => set("capacityPerDay", v.replace(/\D/g, "").slice(0, 4))}
            />
          </div>

          {/*
            Asked only of somebody who says they make food, and the only
            legitimate branch on a specialty (CLAUDE.md, M22): a specialty
            may decide what a form *asks*, never what a HomeKrafter can
            reach. Asking a candle maker for a food licence reads as a
            requirement they cannot meet.

            `aria-live` because the trigger is a chip several rows up.
          */}
          <div aria-live="polite">
            {sellsFood && (
              <TextField
                label="FSSAI licence number"
                inputMode="numeric"
                placeholder="14 digits"
                help="If you have one. We check it before we show a verified badge — leave it blank if you are still applying for yours."
                value={form.fssaiNumber}
                onChange={(v) => set("fssaiNumber", v)}
                onBlur={() => touch("fssaiNumber")}
                error={touched.fssaiNumber ? fieldErrors.fssaiNumber : null}
              />
            )}
          </div>

          <Textarea
            label="Tell us a bit about it"
            rows={4}
            placeholder="Tell us about your products, how long you've been making them, and where you sell today…"
            value={form.description}
            onChange={(event) => set("description", event.target.value)}
          />

          {/* `aria-live` so a screen-reader user hears the failure — the
              button re-enabling is not an announcement. */}
          <div aria-live="polite">
            {error && (
              <p className={styles.error} role="alert">
                {error}
              </p>
            )}
          </div>

          <Button variant="primary" onClick={handleSubmit} disabled={!valid || busy} className={styles.submitButton}>
            Submit application
          </Button>
        </Card>
      )}
    </section>
  );
}

/**
 * One labelled text field with help text and an inline error.
 *
 * Local to this form rather than a `components/ui` primitive: there is no
 * `Input` primitive in the design system today, and inventing one here
 * would mean either adopting it in the other thirty forms in the same
 * change or leaving a primitive that one screen uses. The standardisation
 * this form needed was *within itself* — nine boxes that each declared
 * their own label markup.
 *
 * The error is wired with `aria-describedby` and `aria-invalid`, so it is
 * announced rather than merely coloured.
 */
function TextField({
  label,
  value,
  onChange,
  onBlur,
  error,
  help,
  type = "text",
  inputMode,
  placeholder,
  required,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  error?: string | null;
  help?: string;
  type?: string;
  inputMode?: "numeric";
  placeholder?: string;
  required?: boolean;
}) {
  const id = label.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const describedBy = [help ? `${id}-help` : null, error ? `${id}-error` : null]
    .filter(Boolean)
    .join(" ");
  return (
    <label className={styles.field}>
      <span className={styles.fieldLabel}>
        {label}
        {required ? "" : " (optional)"}
      </span>
      <input
        className={styles.input}
        type={type}
        inputMode={inputMode}
        placeholder={placeholder}
        value={value}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy || undefined}
        onChange={(event) => onChange(event.target.value)}
        onBlur={onBlur}
      />
      {help && (
        <span id={`${id}-help`} className={styles.fieldHelp}>
          {help}
        </span>
      )}
      {error && (
        <span id={`${id}-error`} className={styles.fieldError}>
          {error}
        </span>
      )}
    </label>
  );
}
