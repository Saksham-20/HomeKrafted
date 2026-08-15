"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { AdminPageHeader } from "./AdminPageHeader";
import { useAuth } from "@/lib/auth/AuthContext";
import {
  apiErrorMessage,
  getPlatformSettings,
  updatePlatformSettings,
  type PlatformSettings,
} from "@/lib/api";
import styles from "./SettingsClient.module.css";

interface Draft {
  commissionPct: string;
  defaultDeliveryRadiusKm: string;
  servicedPincodePrefixes: string;
  menuLockTime: string;
}

/**
 * `/admin/settings` (M16, M5) — platform values that used to be constants
 * in source, changeable only by shipping a build.
 *
 * **Only settings something reads.** A settings screen full of knobs that
 * change nothing is worse than no settings screen: it tells an admin
 * their change took effect. That rule is why the hamper-builder toggle
 * left in M18 along with the builder it gated — the flag stopped being
 * read by anything the moment `/hamper` became a plain catalogue page.
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
        servicedPincodePrefixes: loaded.servicedPincodePrefixes ?? "",
        menuLockTime: loaded.menuLockTime ?? "20:00",
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
    try {
      const updated = await updatePlatformSettings({
        commissionPct: Number(draft.commissionPct),
        defaultDeliveryRadiusKm: Number(draft.defaultDeliveryRadiusKm),
        servicedPincodePrefixes: draft.servicedPincodePrefixes.trim(),
        menuLockTime: draft.menuLockTime.trim(),
      });
      if (!updated) {
        setMessage("That did not save. Commission must be 0–100%, radius 1–100 km.");
        return;
      }
      setSettings(updated);
      setMessage("Saved. Every change here is written to the audit log.");
    } catch (err) {
      // The `!updated` branch only covers a falsy result. A thrown
      // refusal — the commission range check is server-side — skipped it
      // entirely and left the button spinning.
      setMessage(apiErrorMessage(err, "That did not save. Try again."));
    } finally {
      setSaving(false);
    }
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
            <strong>Modelling only.</strong>{" "}Payouts are gross and settlement happens by hand, so
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

        {/*
          Where we deliver — which is a different question from where
          people may sign up to sell (M36). Applications are national;
          this is not.
        */}
        <div className={styles.setting}>
          <label className={styles.field}>
            <span className={styles.label}>Serviced areas (pincode prefixes)</span>
            <input
              className={styles.input}
              value={draft.servicedPincodePrefixes}
              onChange={(event) => edit({ servicedPincodePrefixes: event.target.value })}
              placeholder="160,1401,1403,1341,1346"
            />
          </label>
          <p className={styles.help}>
            Comma-separated. <code>160</code> covers all of Chandigarh; the default above is the
            tricity. This changes what <strong>buyers</strong>{" "}are told — someone outside it still
            sees the whole catalogue, they are just told we don&rsquo;t deliver to them yet.{" "}
            <strong>It does not affect who can apply or be approved.</strong> HomeKrafters can join
            from anywhere in India, which is deliberate: supply has to exist somewhere before it is
            worth opening delivery there. Leave it empty to stop saying it altogether.
          </p>
        </div>

        <div className={styles.setting}>
          <label className={styles.field}>
            <span className={styles.label}>Meal menu lock time</span>
            <input
              className={styles.input}
              value={draft.menuLockTime}
              onChange={(event) => edit({ menuLockTime: event.target.value })}
              placeholder="20:00"
            />
          </label>
          <p className={styles.help}>
            A delivery date&rsquo;s menu closes at this time <strong>the evening before</strong>{" "}
            (24-hour, IST). After it, the kitchen can&rsquo;t change that date and subscribers
            can&rsquo;t skip it — an admin can still fix a genuine emergency from the plan&rsquo;s
            catalog entry, and subscribers are told either way.
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
