"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { AdminPageHeader } from "./AdminPageHeader";
import { useAuth } from "@/lib/auth/AuthContext";
import { getPlatformSettings, updatePlatformSettings, type PlatformSettings } from "@/lib/api";
import styles from "./SettingsClient.module.css";

interface Draft {
  commissionPct: string;
  defaultDeliveryRadiusKm: string;
  hamperBuilderEnabled: boolean;
}

/**
 * `/admin/settings` (M16, M5; feature flags added M17) — platform values
 * that used to be constants in source, changeable only by shipping a
 * build.
 *
 * **Only settings something reads.** A settings screen full of knobs that
 * change nothing is worse than no settings screen: it tells an admin
 * their change took effect. The hamper flag only appeared here once
 * `GET /settings/public` and `lib/features/` made every reader — the
 * route gate and all four client components — resolve the same value, so
 * flipping it can no longer leave a feature half-open until the next
 * deploy.
 */
export function SettingsClient() {
  const { ready, role } = useAuth();
  const [settings, setSettings] = useState<PlatformSettings | undefined>();
  const [draft, setDraft] = useState<Draft | undefined>();
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | undefined>();

  useEffect(() => {
    if (!ready || role !== "admin") return;
    let cancelled = false;
    (async () => {
      const loaded = await getPlatformSettings();
      if (cancelled || !loaded) return;
      setSettings(loaded);
      setDraft({
        commissionPct: String(loaded.commissionPct),
        defaultDeliveryRadiusKm: String(loaded.defaultDeliveryRadiusKm),
        hamperBuilderEnabled: loaded.hamperBuilderEnabled,
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [ready, role]);

  if (!ready || !settings || !draft) {
    return <div className={styles.loading}>Loading settings…</div>;
  }

  function edit(patch: Partial<Draft>) {
    setDraft((current) => (current ? { ...current, ...patch } : current));
    setMessage(undefined);
  }

  async function handleSave() {
    if (!draft) return;
    setSaving(true);
    setMessage(undefined);
    const updated = await updatePlatformSettings({
      commissionPct: Number(draft.commissionPct),
      defaultDeliveryRadiusKm: Number(draft.defaultDeliveryRadiusKm),
      hamperBuilderEnabled: draft.hamperBuilderEnabled,
    });
    setSaving(false);
    if (!updated) {
      setMessage("That did not save. Commission must be 0–100%, radius 1–100 km.");
      return;
    }
    setSettings(updated);
    setMessage("Saved. Every change here is written to the audit log.");
  }

  return (
    <div>
      <AdminPageHeader
        title="Platform settings"
        subtitle="Values that used to be constants in source. Every change is audited."
      />

      <Card className={styles.card} padding="lg">
        <div className={styles.setting}>
          <label className={styles.field}>
            <span className={styles.label}>Commission rate (%)</span>
            <input
              className={styles.input}
              inputMode="decimal"
              value={draft.commissionPct}
              onChange={(event) => edit({ commissionPct: event.target.value })}
            />
          </label>
          <p className={styles.help}>
            <strong>Modelling only.</strong> Payouts are gross and settlement happens by hand, so
            nothing deducts this today. It drives the commission line on Analytics, which exists so
            &ldquo;what would 12% have earned last quarter&rdquo; is answerable before anyone commits to a
            rate.
          </p>
        </div>

        <div className={styles.setting}>
          <label className={styles.field}>
            <span className={styles.label}>Default delivery radius (km)</span>
            <input
              className={styles.input}
              inputMode="numeric"
              value={draft.defaultDeliveryRadiusKm}
              onChange={(event) => edit({ defaultDeliveryRadiusKm: event.target.value })}
            />
          </label>
          <p className={styles.help}>
            Given to a newly approved HomeKrafter whose application didn&rsquo;t state one. Existing
            kitchens keep whatever they already have — this is a starting value, not a cap.
          </p>
        </div>

        <div className={styles.setting}>
          <label className={styles.toggle}>
            <input
              type="checkbox"
              checked={draft.hamperBuilderEnabled}
              onChange={(event) => edit({ hamperBuilderEnabled: event.target.checked })}
            />
            <span className={styles.label}>Hamper builder is live</span>
          </label>
          <p className={styles.help}>
            Turns <code>/hamper</code> from the coming-soon page into the wizard, and switches the
            home hero, product detail and empty cart from &ldquo;coming soon&rdquo; to a real link.{" "}
            <strong>All of them change together</strong> — the route and every button read the same
            value, so this can&rsquo;t leave the feature half-open. Visitors see the change within a
            minute.
          </p>
        </div>

        <div className={styles.actions}>
          <Button variant="primary" onClick={handleSave} disabled={saving}>
            {saving ? "Saving…" : "Save settings"}
          </Button>
          <span className={styles.message} role="status" aria-live="polite">
            {message ?? ""}
          </span>
        </div>
      </Card>
    </div>
  );
}
