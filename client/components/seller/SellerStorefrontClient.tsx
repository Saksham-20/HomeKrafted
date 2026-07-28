"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Textarea } from "@/components/ui/Textarea";
import { ImageSlot } from "@/components/placeholder/ImageSlot";
import { SellerPageHeader } from "./SellerPageHeader";
import { ModuleUnavailable, isForbidden } from "./ModuleUnavailable";
import { useAuth } from "@/lib/auth/AuthContext";
import { getSellerVendor, updateSellerStorefront } from "@/lib/api";
import type { Vendor } from "@/lib/types";
import styles from "./SellerStorefrontClient.module.css";

interface FormState {
  bio: string;
  location: string;
  avatarSrc: string;
  bannerSrc: string;
}

/**
 * `/seller/storefront` (M10a) — edits the exact `Vendor` fields the
 * consumer `/storefront/[vendor]` page renders (`StoreHeader`): bio,
 * location, avatar/banner paths. Saved via `updateSellerStorefront`
 * (`lib/api/seller.ts`), which mutates the shared `Vendor` record in this
 * browser tab's in-memory module instance — real within the live session
 * (edit, navigate elsewhere in the portal via a Link, come back: still
 * there), but lost on a hard reload of *any* page, and never visible on
 * the consumer storefront at all, since that page is a Server Component
 * re-rendered against the server's own untouched copy on every request.
 * See the long comment on `updateSellerStorefront` for why — a real fix
 * needs a server-side write, which lands with M8.
 */
export function SellerStorefrontClient() {
  const { ready, seller } = useAuth();
  const [vendor, setVendor] = useState<Vendor | undefined>(undefined);
  const [form, setForm] = useState<FormState>({ bio: "", location: "", avatarSrc: "", bannerSrc: "" });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    // No `vendorId` means no storefront to edit (laundry partners, snack
    // sellers) — reachable now that the nav lists every module. Derived at
    // render time (`noStorefront`), so this effect just skips.
    if (!ready || !seller?.vendorId) return;
    let cancelled = false;
    (async () => {
      try {
        const v = await getSellerVendor(seller.vendorId!);
        if (cancelled) return;
        if (!v) {
          setUnavailable(true);
          return;
        }
        setVendor(v);
        setForm({
          bio: v.bio,
          location: v.location,
          avatarSrc: v.avatarSrc ?? "",
          bannerSrc: v.bannerSrc ?? "",
        });
      } catch (error) {
        if (cancelled) return;
        if (!isForbidden(error)) throw error;
        setUnavailable(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ready, seller]);

  async function handleSave() {
    if (!seller?.vendorId) return;
    setSaving(true);
    const updated = await updateSellerStorefront(seller.vendorId, form);
    setVendor(updated);
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }

  const noStorefront = ready && !!seller && !seller.vendorId;
  if (noStorefront || unavailable) {
    return <ModuleUnavailable module="Storefront" />;
  }

  if (!ready || loading || !vendor) {
    return <div className={styles.loading}>Loading your storefront…</div>;
  }

  return (
    <div>
      <SellerPageHeader
        title="Storefront"
        subtitle="This is what shoppers see on your public maker page."
        actions={
          <Link href={`/storefront/${vendor.slug}`} className={styles.previewLink} target="_blank">
            View live storefront →
          </Link>
        }
      />

      <Card className={styles.card}>
        <div className={styles.bannerPreview}>
          <ImageSlot ratio="16/5" label={vendor.bannerPlaceholder} src={form.bannerSrc || undefined} />
        </div>

        <div className={styles.row}>
          <div className={styles.avatarPreview}>
            <ImageSlot
              ratio="1/1"
              shape="circle"
              label={vendor.avatarPlaceholder}
              src={form.avatarSrc || undefined}
              compact
            />
          </div>
          <div className={styles.fields}>
            <label className={styles.field}>
              <span className={styles.label}>Avatar image path</span>
              <input
                className={styles.input}
                value={form.avatarSrc}
                onChange={(event) => setForm((f) => ({ ...f, avatarSrc: event.target.value }))}
                placeholder="/images/vendors/avatar.jpg"
              />
            </label>
            <label className={styles.field}>
              <span className={styles.label}>Banner image path</span>
              <input
                className={styles.input}
                value={form.bannerSrc}
                onChange={(event) => setForm((f) => ({ ...f, bannerSrc: event.target.value }))}
                placeholder="/images/vendors/banner.jpg"
              />
            </label>
            <label className={styles.field}>
              <span className={styles.label}>Location</span>
              <input
                className={styles.input}
                value={form.location}
                onChange={(event) => setForm((f) => ({ ...f, location: event.target.value }))}
              />
            </label>
            <div className={styles.fieldWide}>
              <Textarea
                label="Bio"
                value={form.bio}
                onChange={(event) => setForm((f) => ({ ...f, bio: event.target.value }))}
              />
            </div>
            <p className={styles.hint}>
              No upload yet — point image paths at an existing file under{" "}
              <code>public/images/vendors/</code>.
            </p>
          </div>
        </div>

        <div className={styles.actions}>
          <Button variant="primary" onClick={handleSave} disabled={saving}>
            {saving ? "Saving…" : "Save changes"}
          </Button>
          {saved && <span className={styles.savedNote}>Saved.</span>}
        </div>
      </Card>
    </div>
  );
}
