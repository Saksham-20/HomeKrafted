"use client";

import { useState } from "react";
import clsx from "clsx";
import { Building2 } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { Textarea } from "@/components/ui/Textarea";
import { createCorporateInquiry, type CreateCorporateInquiryInput } from "@/lib/api";
import { ApiError } from "@/lib/api/http";
import type { CorporateInquiry } from "@/lib/types";
import styles from "./CorporateInquiryClient.module.css";

export interface CorporateInquiryClientProps {
  occasions: string[];
  budgetRanges: string[];
}

const EMPTY_FORM = {
  companyName: "",
  contactName: "",
  email: "",
  phone: "",
  occasion: "",
  estimatedQuantity: "",
  budgetRange: "",
  message: "",
};

/**
 * Corporate / bulk gifting inquiry (M7b) — a plain lead-capture form
 * (`CorporateInquiry`) → mock submit (`createCorporateInquiry`) → a
 * thank-you state. No prototype screen to port; built inside the
 * established `Card`/`Chip`/`Textarea` system, same as `AddressBookClient`.
 */
export function CorporateInquiryClient({ occasions, budgetRanges }: CorporateInquiryClientProps) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inquiry, setInquiry] = useState<CorporateInquiry | null>(null);

  function set<K extends keyof typeof EMPTY_FORM>(key: K, value: string) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  const quantity = Number(form.estimatedQuantity);
  const valid =
    form.companyName.trim().length > 0 &&
    form.contactName.trim().length > 0 &&
    form.email.trim().length > 0 &&
    form.phone.trim().length > 0 &&
    form.message.trim().length > 0 &&
    quantity > 0;

  /**
   * The `catch` matters more here than anywhere else on the site: this is
   * the corporate lead form, where a single inquiry is worth thousands of
   * rupees. It used to be `try { … } finally { setBusy(false) }` with no
   * `catch`, so a failed submit re-enabled the button, said nothing, and
   * the lead was simply gone.
   */
  async function handleSubmit() {
    if (!valid || busy) return;
    setBusy(true);
    setError(null);
    try {
      const input: CreateCorporateInquiryInput = {
        companyName: form.companyName.trim(),
        contactName: form.contactName.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
        occasion: form.occasion || undefined,
        estimatedQuantity: quantity,
        budgetRange: form.budgetRange || undefined,
        message: form.message.trim(),
      };
      const created = await createCorporateInquiry(input);
      setInquiry(created);
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 429
          ? "That was a lot of attempts in a row. Wait a minute and try again."
          : err instanceof ApiError && err.message
            ? err.message
            : "We couldn’t send your enquiry just now. Check your connection and try again — or call us and we’ll take the details over the phone.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={clsx("container", styles.page)}>
      <div className={styles.header}>
        <span className={styles.eyebrow}>Corporate &amp; bulk gifting</span>
        <h1 className={styles.title}>Gifting for teams, clients &amp; celebrations</h1>
        <p className={styles.subtitle}>
          Curated hampers at volume — festive kits, onboarding boxes, client thank-yous. Tell us
          what you need and our team will put a proposal together.
        </p>
      </div>

      {inquiry ? (
        <Card className={styles.confirmationCard}>
          <span className={styles.confirmationBadge}>Inquiry received</span>
          <p className={styles.confirmationTitle}>Thanks, {inquiry.contactName.split(" ")[0]}!</p>
          <p className={styles.confirmationCopy}>
            We&rsquo;ve received your inquiry for <b>{inquiry.companyName}</b> (
            {inquiry.estimatedQuantity.toLocaleString("en-IN")} pieces). Our corporate gifting
            team will reach out at {inquiry.email} within 24 hours.
          </p>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              setInquiry(null);
              setForm(EMPTY_FORM);
            }}
          >
            Submit another inquiry
          </Button>
        </Card>
      ) : (
        <Card className={styles.formCard}>
          <div className={styles.formHeader}>
            <Building2 size={20} strokeWidth={1.6} aria-hidden="true" />
            <span>Tell us about your order</span>
          </div>

          <div className={styles.formGrid}>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>Company name</span>
              <input
                className={styles.input}
                value={form.companyName}
                onChange={(event) => set("companyName", event.target.value)}
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
              <span className={styles.fieldLabel}>Estimated quantity</span>
              <input
                type="number"
                min={1}
                inputMode="numeric"
                className={styles.input}
                placeholder="e.g. 50"
                value={form.estimatedQuantity}
                onChange={(event) => set("estimatedQuantity", event.target.value)}
              />
            </label>
            <div className={styles.field}>
              <span className={styles.fieldLabel}>Occasion (optional)</span>
              <div className={styles.chipRow}>
                {occasions.map((occasion) => (
                  <Chip
                    key={occasion}
                    label={occasion}
                    selected={form.occasion === occasion}
                    onClick={() => set("occasion", form.occasion === occasion ? "" : occasion)}
                  />
                ))}
              </div>
            </div>
            <div className={styles.fieldWide}>
              <span className={styles.fieldLabel}>Budget range (optional)</span>
              <div className={styles.chipRow}>
                {budgetRanges.map((range) => (
                  <Chip
                    key={range}
                    label={range}
                    selected={form.budgetRange === range}
                    onClick={() => set("budgetRange", form.budgetRange === range ? "" : range)}
                  />
                ))}
              </div>
            </div>
          </div>

          <Textarea
            label="What are you looking for?"
            rows={4}
            placeholder="Number of recipients, delivery timeline, customization needs…"
            value={form.message}
            onChange={(event) => set("message", event.target.value)}
          />

          <div aria-live="polite">
            {error && (
              <p className={styles.error} role="alert">
                {error}
              </p>
            )}
          </div>

          <Button variant="primary" onClick={handleSubmit} disabled={!valid || busy} className={styles.submitButton}>
            Send inquiry
          </Button>
        </Card>
      )}
    </section>
  );
}
