"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Textarea";
import { apiErrorMessage, getAdminSellerProfile, setSellerVerification } from "@/lib/api";
import { formatDate } from "@/lib/format";
import type { AdminSellerProfile } from "@/lib/types";
import styles from "./SellerVerificationPanel.module.css";

export interface SellerVerificationPanelProps {
  sellerId: string;
  onChanged?: () => void;
}

const CHECKS = [
  { key: "identityVerified", label: "Identity" },
  { key: "addressVerified", label: "Kitchen address" },
  { key: "fssaiVerified", label: "FSSAI licence" },
] as const;

type CheckKey = (typeof CHECKS)[number]["key"];

/**
 * The verification decision (M16), expanded inline under a seller row.
 *
 * Fetched on open rather than with the seller list: the list is every
 * HomeKrafter on the platform, and pulling a full profile for each one to
 * render three checkboxes nobody has looked at yet would be a request per
 * row for nothing.
 *
 * The three toggles are the badge a buyer trusts. They are only settable
 * here — `PATCH /seller/profile` cannot reach them — and every change is
 * written to `AdminAuditLog` with its before/after state, because "who
 * said this kitchen's licence was real" is the question asked after
 * something goes wrong.
 */
export function SellerVerificationPanel({ sellerId, onChanged }: SellerVerificationPanelProps) {
  const [profile, setProfile] = useState<AdminSellerProfile | undefined>();
  const [note, setNote] = useState("");
  const [pending, setPending] = useState<Record<CheckKey, boolean | undefined>>({
    identityVerified: undefined,
    addressVerified: undefined,
    fssaiVerified: undefined,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | undefined>();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const loaded = await getAdminSellerProfile(sellerId);
      if (!cancelled) setProfile(loaded);
    })();
    return () => {
      cancelled = true;
    };
  }, [sellerId]);

  if (!profile) return <div className={styles.loading}>Loading profile…</div>;

  /** Pending overrides the stored value, so an unsaved toggle shows what the admin is about to do. */
  function valueOf(key: CheckKey): boolean {
    return pending[key] ?? Boolean(profile?.[key]);
  }

  const dirty = CHECKS.some(({ key }) => pending[key] !== undefined) || note.trim() !== "";

  async function handleSave() {
    setSaving(true);
    setError(undefined);
    try {
      const updated = await setSellerVerification(sellerId, {
        ...(pending.identityVerified !== undefined ? { identityVerified: pending.identityVerified } : {}),
        ...(pending.addressVerified !== undefined ? { addressVerified: pending.addressVerified } : {}),
        ...(pending.fssaiVerified !== undefined ? { fssaiVerified: pending.fssaiVerified } : {}),
        ...(note.trim() ? { note: note.trim() } : {}),
      });
      if (!updated) {
        setError("That did not save.");
        return;
      }
      setProfile(updated);
      setPending({ identityVerified: undefined, addressVerified: undefined, fssaiVerified: undefined });
      setNote("");
      onChanged?.();
    } catch (err) {
      // The verification badge is the whole point of M16, and the write
      // path is audited. A refusal that showed nothing would leave an
      // admin believing they had verified a kitchen they had not.
      setError(apiErrorMessage(err, "That did not save. Try again."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={styles.panel}>
      <div className={styles.evidence}>
        <h3 className={styles.heading}>What they submitted</h3>
        <dl className={styles.facts}>
          <div>
            <dt>FSSAI number</dt>
            <dd className={styles.mono}>
              {profile.fssaiNumber ?? <span className={styles.absent}>Not submitted</span>}
            </dd>
          </div>
          <div>
            <dt>Licence expires</dt>
            <dd>{profile.fssaiExpiry ? formatDate(profile.fssaiExpiry) : "—"}</dd>
          </div>
          <div>
            <dt>Profile complete</dt>
            <dd>{profile.completion.percent}%</dd>
          </div>
          <div>
            <dt>Last decision</dt>
            <dd>{profile.verifiedAt ? formatDate(profile.verifiedAt) : "Never reviewed"}</dd>
          </div>
        </dl>
        <Link className={styles.storefrontLink} href={`/storefront/${profile.vendorSlug}`} target="_blank">
          Open their storefront →
        </Link>
      </div>

      <div className={styles.decision}>
        <h3 className={styles.heading}>Decide</h3>
        <ul className={styles.checks}>
          {CHECKS.map(({ key, label }) => (
            <li key={key}>
              <label className={styles.check}>
                <input
                  type="checkbox"
                  checked={valueOf(key)}
                  onChange={(event) =>
                    setPending((current) => ({ ...current, [key]: event.target.checked }))
                  }
                />
                <span>{label}</span>
              </label>
            </li>
          ))}
        </ul>
        <Textarea
          label="Note to the HomeKrafter"
          rows={2}
          value={note}
          hint="Sent to them. A refused check with no reason becomes a support ticket."
          onChange={(event) => setNote(event.target.value)}
        />
        <div className={styles.actions}>
          <Button variant="primary" size="sm" onClick={handleSave} disabled={saving || !dirty}>
            {saving ? "Saving…" : "Save decision"}
          </Button>
          <span className={styles.status} role="status" aria-live="polite">
            {error ?? ""}
          </span>
        </div>
      </div>
    </div>
  );
}
