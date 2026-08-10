"use client";

import { useState } from "react";
import clsx from "clsx";
import { Store } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { Textarea } from "@/components/ui/Textarea";
import { areasByCity } from "@/lib/geo";
import { SPECIALTY_GROUPS, SPECIALTY_LABELS, type SellerSpecialty } from "@/lib/types";
import { createSellerApplication, type CreateSellerApplicationInput } from "@/lib/api";
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
  city: "",
  /** Tricity area id, or "other" — it's what places the kitchen on the map. */
  area: "",
  /** The locality they type when area is "other". */
  areaLabel: "",
  /**
   * Kept as a string because it comes off a `<select>`; parsed on submit.
   * **Empty means "they didn't say"**, which is what lets the platform
   * default apply at approval — so this starts empty, not at "10".
   */
  deliveryRadiusKm: "",
  description: "",
};

/** The value that turns the area picker into a free-text waitlist entry. */
const OTHER_AREA = "other";

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

  function set<K extends keyof typeof EMPTY_FORM>(key: K, value: string) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  const isOtherArea = form.area === OTHER_AREA;

  const valid =
    form.businessName.trim().length > 0 &&
    form.contactName.trim().length > 0 &&
    form.email.trim().length > 0 &&
    form.phone.trim().length > 0 &&
    form.city.trim().length > 0 &&
    // Area and at least one specialty are required: the first decides where
    // the kitchen sits for every buyer's distance filter, the second is how
    // buyers find them at all.
    form.area.length > 0 &&
    // Mirrors the server's `@ValidateIf(area === 'other')`. Without this the
    // button enables, the POST 400s, and the applicant sees nothing happen.
    (!isOtherArea || form.areaLabel.trim().length > 0) &&
    specialties.length > 0 &&
    form.description.trim().length > 0;

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
        city: form.city.trim(),
        area: form.area,
        areaLabel: isOtherArea ? form.areaLabel.trim() : undefined,
        // Undefined, not 0 or 10 — an omitted radius is what lets the
        // platform default apply at approval.
        deliveryRadiusKm: form.deliveryRadiusKm ? Number(form.deliveryRadiusKm) : undefined,
        description: form.description.trim(),
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

          <div className={styles.formGrid}>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>Business / maker name</span>
              <input
                className={styles.input}
                value={form.businessName}
                onChange={(event) => set("businessName", event.target.value)}
              />
            </label>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>Contact name</span>
              <input
                className={styles.input}
                value={form.contactName}
                onChange={(event) => set("contactName", event.target.value)}
              />
            </label>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>Email</span>
              <input
                type="email"
                className={styles.input}
                value={form.email}
                onChange={(event) => set("email", event.target.value)}
              />
            </label>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>Phone</span>
              <input
                type="tel"
                className={styles.input}
                value={form.phone}
                onChange={(event) => set("phone", event.target.value)}
              />
            </label>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>City</span>
              <input
                className={styles.input}
                value={form.city}
                onChange={(event) => set("city", event.target.value)}
              />
            </label>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>Which area do you work from?</span>
              <select
                className={styles.input}
                value={form.area}
                onChange={(event) => set("area", event.target.value)}
              >
                <option value="">Choose your area…</option>
                {areasByCity().map((group) => (
                  <optgroup key={group.city} label={group.city}>
                    {group.areas.map((area) => (
                      <option key={area.id} value={area.id}>
                        {area.label}
                      </option>
                    ))}
                  </optgroup>
                ))}
                <option value={OTHER_AREA}>Somewhere else</option>
              </select>
            </label>

            {/*
              Revealed only for "Somewhere else". Wrapped in `aria-live` so a
              screen-reader user is told a new required field appeared — the
              trigger is a <select> change, which announces nothing on its own.
            */}
            <div aria-live="polite" className={styles.field}>
              {isOtherArea && (
                <label>
                  <span className={styles.fieldLabel}>Which city or town?</span>
                  <input
                    className={styles.input}
                    value={form.areaLabel}
                    placeholder="e.g. Model Town, Ludhiana"
                    aria-describedby="area-label-help"
                    onChange={(event) => set("areaLabel", event.target.value)}
                  />
                  <span id="area-label-help" className={styles.fieldHelp}>
                    We don&rsquo;t deliver there yet. Tell us where you are and we&rsquo;ll add you
                    to the list for when we open — you won&rsquo;t be able to start selling until
                    then.
                  </span>
                </label>
              )}
            </div>

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
