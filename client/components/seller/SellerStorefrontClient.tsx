"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Textarea } from "@/components/ui/Textarea";
import { ImageSlot } from "@/components/placeholder/ImageSlot";
import { ImageUpload } from "@/components/ui/ImageUpload";
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
 * consumer `/storefront/[vendor]` page renders in its header: bio,
 * location, avatar and banner. Since M8.4b these are a real
 * `PATCH /seller/storefront` against the row every request reads, so an
 * edit here shows up on the public storefront immediately.
 * (`NEXT_PUBLIC_USE_MOCK=true` still keeps the old in-memory behaviour,
 * lost on reload — see `updateSellerStorefront`'s mock branch.)
 *
 * Deliberately **not** the whole profile. The story, hours, policies,
 * kitchen photos and licence live on `/seller/profile` (M16), because
 * these four fields ride on every product card and a return policy has
 * no business in a listing query.
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
          <div className={styles.fields}>
            <ImageUpload
              label="Shop photo"
              purpose="storefront"
              shape="circle"
              ratio="1/1"
              placeholderLabel={vendor.avatarPlaceholder}
              hint="Square works best — this is the round photo buyers see next to your name."
              value={form.avatarSrc}
              onChange={(url) => setForm((f) => ({ ...f, avatarSrc: url }))}
            />
            <ImageUpload
              label="Banner"
              purpose="storefront"
              ratio="16/5"
              placeholderLabel={vendor.bannerPlaceholder}
              hint="A wide shot of your kitchen or your food, roughly 3:1."
              value={form.bannerSrc}
              onChange={(url) => setForm((f) => ({ ...f, bannerSrc: url }))}
            />
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
