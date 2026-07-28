"use client";

import { useState } from "react";
import clsx from "clsx";
import { Store } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { Textarea } from "@/components/ui/Textarea";
import { createSellerApplication, type CreateSellerApplicationInput } from "@/lib/api";
import type { SellerApplication, SellerApplicationCategory } from "@/lib/types";
import type { SellerBenefit, SellerStep } from "@/lib/data";
import styles from "./SellerApplicationClient.module.css";

export interface SellerApplicationClientProps {
  benefits: SellerBenefit[];
  steps: SellerStep[];
  categories: { value: SellerApplicationCategory; label: string }[];
}

const EMPTY_FORM = {
  businessName: "",
  contactName: "",
  email: "",
  phone: "",
  city: "",
  description: "",
};

/**
 * Sell on Homekrafted — seller-onboarding info + a real, submittable
 * application form. **Real as of M9**: `createSellerApplication` posts to
 * `POST /seller-applications`, which lands in the actual admin approval
 * queue (`/admin/sellers` → "Approval queue") — an approved application
 * becomes a live `Seller` + storefront a real person can log into. No
 * longer future-flagged (see `docs/PRD.md`'s M7b-era "future" note, now
 * superseded).
 */
export function SellerApplicationClient({ benefits, steps, categories }: SellerApplicationClientProps) {
  const [category, setCategory] = useState<SellerApplicationCategory>(categories[0]?.value ?? "maker");
  const [form, setForm] = useState(EMPTY_FORM);
  const [busy, setBusy] = useState(false);
  const [application, setApplication] = useState<SellerApplication | null>(null);

  function set<K extends keyof typeof EMPTY_FORM>(key: K, value: string) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  const valid =
    form.businessName.trim().length > 0 &&
    form.contactName.trim().length > 0 &&
    form.email.trim().length > 0 &&
    form.phone.trim().length > 0 &&
    form.city.trim().length > 0 &&
    form.description.trim().length > 0;

  async function handleSubmit() {
    if (!valid || busy) return;
    setBusy(true);
    try {
      const input: CreateSellerApplicationInput = {
        businessName: form.businessName.trim(),
        contactName: form.contactName.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
        category,
        city: form.city.trim(),
        description: form.description.trim(),
      };
      const created = await createSellerApplication(input);
      setApplication(created);
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
          <span className={styles.confirmationBadge}>Application submitted</span>
          <p className={styles.confirmationTitle}>Thanks, {application.contactName.split(" ")[0]}!</p>
          <p className={styles.confirmationCopy}>
            We&rsquo;ve received your application for <b>{application.businessName}</b> and it&rsquo;s
            now under review. We&rsquo;ll email {application.email} once a decision is made.
          </p>
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
            <div className={styles.field}>
              <span className={styles.fieldLabel}>Category</span>
              <div className={styles.chipRow}>
                {categories.map((option) => (
                  <Chip
                    key={option.value}
                    label={option.label}
                    selected={category === option.value}
                    onClick={() => setCategory(option.value)}
                  />
                ))}
              </div>
            </div>
          </div>

          <Textarea
            label="What do you make?"
            rows={4}
            placeholder="Tell us about your products, how long you've been making them, and where you sell today…"
            value={form.description}
            onChange={(event) => set("description", event.target.value)}
          />

          <Button variant="primary" onClick={handleSubmit} disabled={!valid || busy} className={styles.submitButton}>
            Submit application
          </Button>
        </Card>
      )}
    </section>
  );
}
