"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { formatCurrency } from "@/lib/format";
import { Textarea } from "@/components/ui/Textarea";
import { ImageSlot } from "@/components/placeholder/ImageSlot";
import { ImageUpload } from "@/components/ui/ImageUpload";
import { SellerPageHeader } from "./SellerPageHeader";
import { ModuleUnavailable, isForbidden } from "./ModuleUnavailable";
import { useAuth } from "@/lib/auth/AuthContext";
import { getSellerVendor, setSellerDiscount, updateSellerStorefront } from "@/lib/api";
import { apiErrorMessage } from "@/lib/api/errors";
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
/**
 * The ceiling, mirrored from `server/src/catalog/vendor-discount.ts`.
 *
 * Deliberately duplicated rather than fetched: it decides what the input
 * *offers*, and the server is what decides what is *accepted* — the same
 * looser-client rule the two identifier parsers follow (M17). A drift
 * here costs one clear 400, never a locked-out seller.
 */
const MAX_DISCOUNT_PCT = 50;

/**
 * The inverse of `endsAtFromLastDay`. `discountEndsAt` is the exclusive
 * instant the sale stops; the field says "last day of the sale", so it
 * has to show the day *before* it. Slicing the ISO string straight into
 * the input showed 1 September on a sale the same card described as
 * running "through 31 August".
 */
function lastDayFromEndsAt(endsAt?: string): string {
  if (!endsAt) return "";
  const lastDay = new Date(endsAt);
  lastDay.setDate(lastDay.getDate() - 1);
  const year = lastDay.getFullYear();
  const month = String(lastDay.getMonth() + 1).padStart(2, "0");
  const day = String(lastDay.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** Numbers in the "whose money is this" sentence. A worked example lands where a percentage sign does not. */
const DISCOUNT_EXAMPLE_PCT = 10;
const DISCOUNT_EXAMPLE_PRICE = 250;

export function SellerStorefrontClient() {
  const { ready, seller, sellerDataReady } = useAuth();
  const [vendor, setVendor] = useState<Vendor | undefined>(undefined);
  const [form, setForm] = useState<FormState>({ bio: "", location: "", avatarSrc: "", bannerSrc: "" });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  /** What the server said when it refused. Rendered next to Save, like `/seller/profile`. */
  const [error, setError] = useState<string | undefined>();
  const [unavailable, setUnavailable] = useState(false);

  // M46 — the discount is its own form with its own save, because it is
  // its own endpoint and its own kind of decision: the four fields above
  // are how a storefront looks, and this one changes the price of
  // everything in it.
  const [discountPct, setDiscountPct] = useState("");
  const [discountEnds, setDiscountEnds] = useState("");
  const [discountSaving, setDiscountSaving] = useState(false);
  const [discountSaved, setDiscountSaved] = useState(false);
  const [discountError, setDiscountError] = useState<string | undefined>();

  useEffect(() => {
    // No `vendorId` means no storefront to edit (laundry partners, snack
    // sellers) — reachable now that the nav lists every module. Derived at
    // render time (`noStorefront`), so this effect just skips.
    if (!sellerDataReady) return;
    let cancelled = false;
    (async () => {
      try {
        const v = await getSellerVendor(seller?.vendorId ?? "");
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
        setDiscountPct(v.discount ? String(v.discount.pct) : "");
        setDiscountEnds(lastDayFromEndsAt(v.discount?.endsAt));
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
  }, [sellerDataReady, seller]);

  async function handleSave() {
    if (!seller?.vendorId) return;
    setSaving(true);
    setError(undefined);
    // `updateSellerStorefront` stopped swallowing in M36. Without a catch
    // a refusal skips `setSaving(false)` too, so the button sits on
    // "Saving…" and the four fields that ride on every product card look
    // saved when they are not.
    try {
      const updated = await updateSellerStorefront(seller.vendorId, form);
      setVendor(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      setError(apiErrorMessage(err, "That did not save. Try again."));
    } finally {
      setSaving(false);
    }
  }

  /**
   * The date input gives a calendar day and the seller reads it as "the
   * last day of the sale". `discountEndsAt` is **exclusive**, so what is
   * stored is midnight at the start of the following day. Converting here
   * rather than labelling the field "ends before" is the whole point:
   * nobody should have to reason about an exclusive boundary to run a
   * sale.
   */
  function endsAtFromLastDay(lastDay: string): string | undefined {
    if (!lastDay) return undefined;
    const midnightAfter = new Date(`${lastDay}T00:00:00`);
    midnightAfter.setDate(midnightAfter.getDate() + 1);
    return midnightAfter.toISOString();
  }

  async function handleDiscountSave() {
    if (!seller?.vendorId) return;
    const pct = Number(discountPct) || 0;
    setDiscountSaving(true);
    setDiscountError(undefined);
    try {
      const updated = await setSellerDiscount(seller.vendorId, {
        pct,
        endsAt: pct > 0 ? endsAtFromLastDay(discountEnds) : undefined,
      });
      setVendor(updated);
      setDiscountSaved(true);
      setTimeout(() => setDiscountSaved(false), 2500);
    } catch (err) {
      setDiscountError(apiErrorMessage(err, "That did not save. Try again."));
    } finally {
      setDiscountSaving(false);
    }
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
              hint="A wide shot of your workspace or what you make, roughly 3:1."
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
          {saved && !error && <span className={styles.savedNote}>Saved.</span>}
          {error && (
            <span className={styles.saveError} role="status" aria-live="polite">
              {error}
            </span>
          )}
        </div>
      </Card>

      {/*
        M46 — your own sale, on your own things.

        A separate card with its own save, because it is a separate
        endpoint and a separate kind of decision: everything above is how
        the storefront *looks*, and this changes what everything in it
        *costs*. The sentence about whose money it is sits above the
        input rather than under it, because it is the thing somebody needs
        to know before they type a number, not after.
      */}
      <Card className={styles.card}>
        <h2 className={styles.discountTitle}>Run a sale</h2>
        <p className={styles.discountLead}>
          Take a percentage off <strong>everything you make</strong>. Shoppers see the new price
          with the old one crossed out, on every one of your listings at once.
        </p>
        <p className={styles.discountWarning}>
          It comes out of what you earn, not out of our fee — a {DISCOUNT_EXAMPLE_PCT}% sale on a{" "}
          {formatCurrency(DISCOUNT_EXAMPLE_PRICE)} jar means the buyer pays{" "}
          {formatCurrency(Math.round((DISCOUNT_EXAMPLE_PRICE * (100 - DISCOUNT_EXAMPLE_PCT)) / 100))}{" "}
          and you are paid on that. Set it back to 0 any time to stop.
        </p>

        <div className={styles.discountRow}>
          <label className={styles.discountField}>
            <span className={styles.discountLabel}>Percent off</span>
            <input
              className={styles.discountInput}
              type="number"
              inputMode="numeric"
              min={0}
              max={MAX_DISCOUNT_PCT}
              value={discountPct}
              onChange={(event) => setDiscountPct(event.target.value)}
              placeholder="0"
            />
            <span className={styles.discountHelp}>
              0 turns it off. {MAX_DISCOUNT_PCT}% is the most we allow.
            </span>
          </label>

          <label className={styles.discountField}>
            <span className={styles.discountLabel}>Last day of the sale</span>
            <input
              className={styles.discountInput}
              type="date"
              value={discountEnds}
              onChange={(event) => setDiscountEnds(event.target.value)}
              disabled={(Number(discountPct) || 0) <= 0}
            />
            <span className={styles.discountHelp}>
              Leave it empty to run until you turn it off.
            </span>
          </label>
        </div>

        {vendor.discount && (
          <p className={styles.discountLive} role="status">
            Live now: {vendor.discount.pct}% off everything
            {vendor.discount.endsAt
              ? `, through ${new Date(new Date(vendor.discount.endsAt).getTime() - 86_400_000).toLocaleDateString("en-IN", { day: "numeric", month: "long" })}`
              : ", until you turn it off"}
            .
          </p>
        )}

        <div className={styles.actions}>
          <Button variant="primary" onClick={handleDiscountSave} disabled={discountSaving}>
            {discountSaving
              ? "Saving…"
              : (Number(discountPct) || 0) > 0
                ? "Start the sale"
                : "Turn the sale off"}
          </Button>
          {discountSaved && !discountError && <span className={styles.savedNote}>Saved.</span>}
          {discountError && (
            <span className={styles.saveError} role="status" aria-live="polite">
              {discountError}
            </span>
          )}
        </div>
      </Card>
    </div>
  );
}
