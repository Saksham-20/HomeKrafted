"use client";

import { useEffect, useState } from "react";
import { Field, Input, Switch } from "@/components/portal/Field";
import { FormPage } from "@/components/portal/FormPage";
import { FormSection } from "@/components/portal/FormSection";
import { LoadingRows } from "@/components/portal/LoadingRows";
import { SaveBar } from "@/components/portal/SaveBar";
import { AdminPageHeader } from "./AdminPageHeader";
import { useAuth } from "@/lib/auth/AuthContext";
import {
  apiErrorMessage,
  getPlatformSettings,
  updatePlatformSettings,
  type PlatformSettings,
} from "@/lib/api";
import { isDirty } from "@/lib/portal/dirty";
import styles from "./SettingsClient.module.css";

interface Draft {
  commissionPct: string;
  commissionEnabled: boolean;
  commissionGstPct: string;
  defaultDeliveryRadiusKm: string;
  servicedPincodePrefixes: string;
  menuLockTime: string;
}

function toDraft(loaded: PlatformSettings): Draft {
  return {
    commissionPct: String(loaded.commissionPct),
    commissionEnabled: loaded.commissionEnabled ?? false,
    commissionGstPct: String(loaded.commissionGstPct ?? 18),
    defaultDeliveryRadiusKm: String(loaded.defaultDeliveryRadiusKm),
    servicedPincodePrefixes: loaded.servicedPincodePrefixes ?? "",
    menuLockTime: loaded.menuLockTime ?? "20:00",
  };
}

const SECTIONS = [
  { id: "settings-commission", label: "Commission" },
  { id: "settings-delivery", label: "Delivery" },
  { id: "settings-meals", label: "Meal plans" },
];

/**
 * `/admin/settings` (M16, M5) — platform values that used to be constants
 * in source, changeable only by shipping a build.
 *
 * **Only settings something reads.** A settings screen full of knobs that
 * change nothing is worse than no settings screen: it tells an admin
 * their change took effect. That rule is why the hamper-builder toggle
 * left in M18 along with the builder it gated — the flag stopped being
 * read by anything the moment `/hamper` became a plain catalogue page.
 *
 * Laid out as annotated sections (2026-09-04): the explanation of what a
 * value does is most of this screen, so it sits beside the control rather
 * than under it, and the one switch that moves money is a switch rather
 * than a checkbox hiding in a label. One save bar for the whole page — it
 * is one row on the server.
 */
export function SettingsClient() {
  const { ready, role } = useAuth();
  const [settings, setSettings] = useState<PlatformSettings | undefined>();
  const [draft, setDraft] = useState<Draft | undefined>();
  const [initial, setInitial] = useState<Draft | undefined>();
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | undefined>();

  useEffect(() => {
    if (!ready || role !== "admin") return;
    let cancelled = false;
    (async () => {
      const loaded = await getPlatformSettings();
      if (cancelled || !loaded) return;
      setSettings(loaded);
      const next = toDraft(loaded);
      setDraft(next);
      setInitial(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [ready, role]);

  if (!ready || !settings || !draft) {
    return (
      <div>
        <AdminPageHeader title="Platform settings" />
        <LoadingRows rows={3} />
      </div>
    );
  }

  function edit(patch: Partial<Draft>) {
    setDraft((current) => (current ? { ...current, ...patch } : current));
    setSaved(false);
    setError(undefined);
  }

  async function handleSave() {
    if (!draft) return;
    setSaving(true);
    setError(undefined);
    try {
      const updated = await updatePlatformSettings({
        commissionPct: Number(draft.commissionPct),
        commissionEnabled: draft.commissionEnabled,
        commissionGstPct: Number(draft.commissionGstPct),
        defaultDeliveryRadiusKm: Number(draft.defaultDeliveryRadiusKm),
        servicedPincodePrefixes: draft.servicedPincodePrefixes.trim(),
        menuLockTime: draft.menuLockTime.trim(),
      });
      if (!updated) {
        setError("That did not save. Commission must be 0–100%, radius 1–100 km.");
        return;
      }
      setSettings(updated);
      const next = toDraft(updated);
      setDraft(next);
      setInitial(next);
      setSaved(true);
    } catch (err) {
      // The `!updated` branch only covers a falsy result. A thrown
      // refusal — the commission range check is server-side — skipped it
      // entirely and left the button spinning.
      setError(apiErrorMessage(err, "That did not save. Try again."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <AdminPageHeader
        title="Platform settings"
        subtitle="Values that used to be constants in source. Every change is written to the audit log."
      />

      <FormPage sections={SECTIONS} navLabel="Sections">
        <FormSection
          id="settings-commission"
          layout="annotated"
          title="Commission"
          status={
            draft.commissionEnabled
              ? { label: "Deducting", tone: "done" }
              : { label: "Switched off", tone: "neutral" }
          }
          description={
            draft.commissionEnabled
              ? "Deducted from payouts. Every new payout request stores its split — gross, commission at this rate, and the net figure that is settled. Changing the rate applies to future requests only; settled rows keep the arithmetic they were cut with."
              : "Estimates only while the switch is off. Payouts are gross and settlement happens by hand, so nothing deducts this today. The rate drives the commission line on Analytics and the estimates a HomeKrafter sees on their payout screen and listing form — all of which say they are estimates."
          }
        >
          <div className={styles.controls}>
            <div className={styles.numberRow}>
              <Field label="Commission rate" className={styles.number}>
                <Input
                  inputMode="decimal"
                  affixEnd="%"
                  value={draft.commissionPct}
                  onChange={(event) => edit({ commissionPct: event.target.value })}
                />
              </Field>
              <Field
                label="GST on the commission"
                className={styles.number}
                hint="Charged on Homekrafted's own fee, never on a HomeKrafter's earnings — so it deducts only while the switch is on. 18% is the standard rate on marketplace commission; changing it is a tax decision."
              >
                <Input
                  inputMode="decimal"
                  affixEnd="%"
                  value={draft.commissionGstPct}
                  onChange={(event) => edit({ commissionGstPct: event.target.value })}
                />
              </Field>
            </div>
            <Switch
              checked={draft.commissionEnabled}
              onChange={(next) => edit({ commissionEnabled: next })}
              label="Deduct commission from payouts"
              help="Off: payouts are gross and every screen says so. On: new payout requests deduct the rate above and the split is stored on every payout row. Already-requested and settled payouts are never recalculated."
            />
          </div>
        </FormSection>

        {/*
          Where we deliver — which is a different question from where
          people may sign up to sell (M36). Applications are national;
          this is not.
        */}
        <FormSection
          id="settings-delivery"
          layout="annotated"
          title="Delivery"
          description="Where buyers are told we deliver, and the radius a new kitchen starts with. Neither affects who can apply or be approved — HomeKrafters can join from anywhere in India, because supply has to exist somewhere before it is worth opening delivery there."
        >
          <div className={styles.controls}>
            <Field
              label="Default delivery radius"
              className={styles.number}
              hint="Given to a newly approved HomeKrafter whose application didn't state one. Existing kitchens keep whatever they already have — a starting value, not a cap."
            >
              <Input
                inputMode="numeric"
                affixEnd="km"
                value={draft.defaultDeliveryRadiusKm}
                onChange={(event) => edit({ defaultDeliveryRadiusKm: event.target.value })}
              />
            </Field>
            <Field
              label="Serviced areas (pincode prefixes)"
              hint={
                <>
                  Comma-separated. <code>160</code> covers all of Chandigarh; the tricity is the
                  default. Somebody outside it still sees the whole catalogue — they are just told we
                  don&rsquo;t deliver to them yet. Leave it empty to stop saying it altogether.
                </>
              }
            >
              <Input
                value={draft.servicedPincodePrefixes}
                onChange={(event) => edit({ servicedPincodePrefixes: event.target.value })}
                placeholder="160,1401,1403,1341,1346"
              />
            </Field>
          </div>
        </FormSection>

        <FormSection
          id="settings-meals"
          layout="annotated"
          title="Meal plans"
          description="A delivery date's menu closes at this time the evening before. After it, the kitchen can't change that date and subscribers can't skip it — an admin can still fix a genuine emergency from the plan's catalog entry, and subscribers are told either way."
        >
          <div className={styles.controls}>
            <Field label="Menu lock time" className={styles.number} hint="24-hour clock, IST.">
              <Input
                type="time"
                value={draft.menuLockTime}
                onChange={(event) => edit({ menuLockTime: event.target.value })}
                placeholder="20:00"
              />
            </Field>
          </div>
        </FormSection>

        <SaveBar
          dirty={isDirty(initial, draft)}
          saving={saving}
          saved={saved}
          error={error}
          onSave={handleSave}
          onDiscard={() => {
            if (initial) setDraft(initial);
            setError(undefined);
          }}
          saveLabel="Save settings"
        />
      </FormPage>
    </div>
  );
}
