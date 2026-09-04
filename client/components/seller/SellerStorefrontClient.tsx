"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { formatCurrency } from "@/lib/format";
import { ImageSlot } from "@/components/placeholder/ImageSlot";
import { CharacterPicker } from "@/components/ui/CharacterPicker";
import { isChefCharacter } from "@/lib/avatars/chef-characters";
import { ImageUpload } from "@/components/ui/ImageUpload";
import { Field, FieldGrid, Input, TextArea } from "@/components/portal/Field";
import { FormPage } from "@/components/portal/FormPage";
import { FormSection } from "@/components/portal/FormSection";
import { LoadingRows } from "@/components/portal/LoadingRows";
import { Notice } from "@/components/portal/Notice";
import { SaveBar } from "@/components/portal/SaveBar";
import { SellerPageHeader } from "./SellerPageHeader";
import { ModuleUnavailable, isForbidden } from "./ModuleUnavailable";
import { useAuth } from "@/lib/auth/AuthContext";
import { getSellerVendor, setSellerDiscount, updateSellerStorefront } from "@/lib/api";
import { apiErrorMessage } from "@/lib/api/errors";
import { kitchenLoading, MAKER_LOADING } from "@/lib/kitchen-copy";
import { isDirty } from "@/lib/portal/dirty";
import type { Vendor } from "@/lib/types";
import styles from "./SellerStorefrontClient.module.css";

interface FormState {
  name: string;
  bio: string;
  location: string;
  avatarSrc: string;
  bannerSrc: string;
}

/**
 * `/seller/storefront` (M10a) — edits the exact `Vendor` fields the
 * consumer `/storefront/[vendor]` page renders in its header: name, bio,
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
 *
 * Three sections since 2026-09-04 — the pictures, the words, the sale —
 * with the first two saved by the page's SaveBar and the sale by its own
 * button, because it is its own endpoint and its own kind of decision.
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

const SECTIONS = [
  { id: "shop-look", label: "Photo & banner" },
  { id: "shop-words", label: "Name & bio" },
  { id: "shop-sale", label: "Run a sale" },
];

export function SellerStorefrontClient() {
  const { ready, seller, sellerDataReady } = useAuth();
  const [vendor, setVendor] = useState<Vendor | undefined>(undefined);
  const [form, setForm] = useState<FormState>({
    name: "",
    bio: "",
    location: "",
    avatarSrc: "",
    bannerSrc: "",
  });
  const [initialForm, setInitialForm] = useState<FormState | undefined>();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  /** What the server said when it refused. Rendered in the SaveBar, announced. */
  const [error, setError] = useState<string | undefined>();
  const [unavailable, setUnavailable] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  // M46 — the discount is its own form with its own save, because it is
  // its own endpoint and its own kind of decision: the fields above are
  // how a storefront looks, and this one changes the price of everything
  // in it.
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
        const loaded = {
          name: v.name,
          bio: v.bio,
          location: v.location,
          avatarSrc: v.avatarSrc ?? "",
          bannerSrc: v.bannerSrc ?? "",
        };
        setForm(loaded);
        setInitialForm(loaded);
        setDiscountPct(v.discount ? String(v.discount.pct) : "");
        setDiscountEnds(lastDayFromEndsAt(v.discount?.endsAt));
      } catch (error) {
        if (cancelled) return;
        if (isForbidden(error)) {
          setUnavailable(true);
          return;
        }
        // A failed read is not an empty screen. Rethrowing here reached no
        // boundary (an effect's rejection is not a render error), so a
        // rate-limited fetch rendered the empty state over real data — the
        // M37 dashboard rule, applied to every list (2026-09-04).
        setLoadError(apiErrorMessage(error, "Couldn't load your shop page. Try again."));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sellerDataReady, seller, reloadToken]);

  function edit(patch: Partial<FormState>) {
    setForm((current) => ({ ...current, ...patch }));
    setSaved(false);
  }

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
      setInitialForm(form);
      setSaved(true);
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
  if (loadError) {
    return (
      <div>
        <SellerPageHeader title="Shop page" />
        <Notice
          tone="danger"
          actions={
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setLoadError(null);
                setLoading(true);
                setReloadToken((n) => n + 1);
              }}
            >
              Try again
            </Button>
          }
        >
          {loadError}
        </Notice>
      </div>
    );
  }

  if (noStorefront || unavailable) {
    return <ModuleUnavailable module="Storefront" />;
  }

  if (!ready || loading || !vendor) {
    return (
      <div>
        <SellerPageHeader title="Shop page" />
        <LoadingRows rows={3} showLabel label={kitchenLoading("seller/storefront", MAKER_LOADING)} />
      </div>
    );
  }

  const dirty = isDirty(initialForm, form);
  const liveDiscountPct = Number(discountPct) || 0;

  return (
    <div>
      <SellerPageHeader
        title="Shop page"
        subtitle="What shoppers see at the top of your storefront and on every one of your product cards."
        actions={
          <Link href={`/storefront/${vendor.slug}`} className={styles.previewLink} target="_blank">
            View live storefront →
          </Link>
        }
      />

      <FormPage sections={SECTIONS} navLabel="Sections">
        <FormSection
          id="shop-look"
          title="Photo and banner"
          description="The round photo sits next to your name everywhere; the banner runs across the top of your storefront."
        >
          <div className={styles.bannerPreview}>
            <ImageSlot ratio="16/5" label={vendor.bannerPlaceholder} src={form.bannerSrc || undefined} />
          </div>
          <FieldGrid>
            <ImageUpload
              label="Shop photo"
              purpose="storefront"
              shape="circle"
              ratio="1/1"
              placeholderLabel={vendor.avatarPlaceholder}
              hint={
                isChefCharacter(form.avatarSrc)
                  ? "Showing the character you picked. Drop a real photo here any time — a photo of you is what buyers trust most."
                  : "Square works best — this is the round photo buyers see next to your name."
              }
              /* A chosen character lives in the same column, so the
                 upload must not show one back as "your photo" — but it
                 does show it as a *preview* (2026-09-04). Picking a
                 character used to leave this slot on the empty hatch,
                 which read as nothing having happened; `previewSrc` is
                 not a value, so "Remove" stays off it and the zone still
                 asks for a real photo. */
              value={isChefCharacter(form.avatarSrc) ? "" : form.avatarSrc}
              previewSrc={isChefCharacter(form.avatarSrc) ? form.avatarSrc : undefined}
              onChange={(url) => edit({ avatarSrc: url })}
            />
            <ImageUpload
              label="Banner"
              purpose="storefront"
              ratio="16/5"
              placeholderLabel={vendor.bannerPlaceholder}
              hint="A wide shot of your workspace or what you make, roughly 3:1."
              value={form.bannerSrc}
              onChange={(url) => edit({ bannerSrc: url })}
            />
          </FieldGrid>
          <CharacterPicker value={form.avatarSrc} onChange={(src) => edit({ avatarSrc: src })} />
        </FormSection>

        <FormSection id="shop-words" title="Name, place and bio">
          <FieldGrid>
            {/*
              Said before they type, not after they save. Two kitchens
              sharing a name is fine — accounts are told apart by phone
              and email — and the address stays put, which is the part
              somebody would otherwise fear losing by renaming.
            */}
            <Field
              label="Shop name"
              hint={
                <>
                  On every listing and order. Another kitchen may have the same name. Your storefront
                  address stays <code>/storefront/{vendor.slug}</code>, so links you have already shared
                  keep working.
                </>
              }
            >
              <Input value={form.name} maxLength={80} onChange={(event) => edit({ name: event.target.value })} />
            </Field>
            <Field label="Location" hint="The area, as buyers should read it — never your street.">
              <Input value={form.location} onChange={(event) => edit({ location: event.target.value })} />
            </Field>
          </FieldGrid>
          <Field label="Bio" hint="Two or three sentences. The longer story lives under About your kitchen.">
            <TextArea rows={3} autoGrow value={form.bio} onChange={(event) => edit({ bio: event.target.value })} />
          </Field>
        </FormSection>

        <SaveBar
          dirty={dirty}
          saving={saving}
          saved={saved}
          error={error}
          onSave={handleSave}
          onDiscard={() => {
            if (initialForm) setForm(initialForm);
            setError(undefined);
          }}
          saveLabel="Save shop page"
        />

        {/*
          M46 — your own sale, on your own things.

          A separate section with its own save, because it is a separate
          endpoint and a separate kind of decision: everything above is how
          the storefront *looks*, and this changes what everything in it
          *costs*. The sentence about whose money it is sits above the
          input rather than under it, because it is the thing somebody needs
          to know before they type a number, not after.
        */}
        <FormSection
          id="shop-sale"
          title="Run a sale"
          status={vendor.discount ? { label: `${vendor.discount.pct}% off, live`, tone: "done" } : undefined}
          description={
            <>
              Take a percentage off <strong>everything you make</strong>. Shoppers see the new price
              with the old one crossed out, on every one of your listings at once.
            </>
          }
          footer={
            <>
              <Button variant="primary" size="sm" onClick={handleDiscountSave} disabled={discountSaving}>
                {discountSaving
                  ? "Saving…"
                  : liveDiscountPct > 0
                    ? vendor.discount
                      ? "Update the sale"
                      : "Start the sale"
                    : "Turn the sale off"}
              </Button>
              <span
                className={discountError ? styles.saveError : styles.savedNote}
                role="status"
                aria-live="polite"
              >
                {discountError ?? (discountSaved ? "Saved." : "")}
              </span>
            </>
          }
        >
          <Notice tone="warning" className={styles.saleNotice}>
            It comes out of what you earn, not out of our fee — a {DISCOUNT_EXAMPLE_PCT}% sale on a{" "}
            {formatCurrency(DISCOUNT_EXAMPLE_PRICE)} jar means the buyer pays{" "}
            {formatCurrency(Math.round((DISCOUNT_EXAMPLE_PRICE * (100 - DISCOUNT_EXAMPLE_PCT)) / 100))}{" "}
            and you are paid on that. Set it back to 0 any time to stop.
          </Notice>

          <FieldGrid>
            <Field label="Percent off" hint={`0 turns it off. ${MAX_DISCOUNT_PCT}% is the most we allow.`}>
              <Input
                type="number"
                inputMode="numeric"
                min={0}
                max={MAX_DISCOUNT_PCT}
                affixEnd="%"
                value={discountPct}
                onChange={(event) => setDiscountPct(event.target.value)}
                placeholder="0"
              />
            </Field>
            <Field label="Last day of the sale" optional hint="Leave it empty to run until you turn it off.">
              <Input
                type="date"
                value={discountEnds}
                onChange={(event) => setDiscountEnds(event.target.value)}
                disabled={liveDiscountPct <= 0}
              />
            </Field>
          </FieldGrid>

          {vendor.discount && (
            <p className={styles.discountLive} role="status">
              Live now: {vendor.discount.pct}% off everything
              {vendor.discount.endsAt
                ? `, through ${new Date(new Date(vendor.discount.endsAt).getTime() - 86_400_000).toLocaleDateString("en-IN", { day: "numeric", month: "long" })}`
                : ", until you turn it off"}
              .
            </p>
          )}
        </FormSection>
      </FormPage>
    </div>
  );
}
