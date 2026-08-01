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
}

/**
 * `/admin/settings` (M16, M5) — platform values that used to be constants
 * in source, changeable only by shipping a build.
 *
 * **Only settings something reads.** A settings screen full of knobs that
 * change nothing is worse than no settings screen: it tells an admin
 * their change took effect. Feature flags deliberately aren't here — see
 * `AdminSettingsService`'s note on why a database flag would leave four
 * client call sites disagreeing with the server until the next deploy.
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

        <div className={styles.actions}>
          <Button variant="primary" onClick={handleSave} disabled={saving}>
            {saving ? "Saving…" : "Save settings"}
          </Button>
          <span className={styles.message} role="status" aria-live="polite">
            {message ?? ""}
          </span>
        </div>
      </Card>

      <Card className={styles.note} padding="md">
        <h2 className={styles.noteTitle}>Not here on purpose</h2>
        <p>
          <strong>Feature flags</strong> stay in <code>client/lib/features.ts</code>, a build-time
          constant. Flipping one from the database would open the server-side gate immediately while
          four client components carried on saying &ldquo;coming soon&rdquo; until the next deploy — a
          half-open feature is worse than a closed one. Making those runtime-correct is its own
          change, tracked in the production audit.
        </p>
      </Card>
    </div>
  );
}
