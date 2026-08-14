"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { BadgeCheck, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { CapacityMeter } from "@/components/ui/CapacityMeter";
import { Chip } from "@/components/ui/Chip";
import { Textarea } from "@/components/ui/Textarea";
import { PhotoUpload } from "@/components/ui/PhotoUpload";
import { SellerPageHeader } from "./SellerPageHeader";
import { ModuleUnavailable, isForbidden } from "./ModuleUnavailable";
import { useAuth } from "@/lib/auth/AuthContext";
import {
  addSellerBlackout,
  addSellerPhoto,
  getSellerBlackouts,
  getSellerProfile,
  getSellerVendor,
  removeSellerBlackout,
  removeSellerPhoto,
  updateSellerProfile,
  updateSellerSpecialties,
  type SellerProfileInput,
} from "@/lib/api";
import { formatDate } from "@/lib/format";
import type {
  OwnVendorProfile,
  SellerSpecialty,
  VendorBlackout,
  VendorPhoto,
} from "@/lib/types";
import { makesFood, SPECIALTY_GROUPS, SPECIALTY_LABELS } from "@/lib/types";
import styles from "./SellerProfileClient.module.css";

const DAYS = [
  { value: 0, label: "Sun" },
  { value: 1, label: "Mon" },
  { value: 2, label: "Tue" },
  { value: 3, label: "Wed" },
  { value: 4, label: "Thu" },
  { value: 5, label: "Fri" },
  { value: 6, label: "Sat" },
];

interface FormState {
  tagline: string;
  story: string;
  knownFor: string;
  languages: string;
  prepTimeMins: string;
  responseTimeMins: string;
  capacityPerDay: string;
  minOrderValue: string;
  workingDays: number[];
  opensAt: string;
  closesAt: string;
  hygieneNote: string;
  /** Where a rider collects (M36c). Private — buyers never see these. */
  pickupAddressLine1: string;
  pickupAddressLine2: string;
  pickupLandmark: string;
  pickupPincode: string;
  pickupPhone: string;
  packagingNote: string;
  cancellationPolicy: string;
  returnPolicy: string;
  acceptsCustomOrders: boolean;
  customOrderPolicy: string;
  fssaiNumber: string;
  instagramUrl: string;
  facebookUrl: string;
  youtubeUrl: string;
  websiteUrl: string;
}

function toForm(profile: OwnVendorProfile): FormState {
  return {
    tagline: profile.tagline ?? "",
    story: profile.story ?? "",
    // Comma-separated in the input, an array on the wire — a home cook
    // typing three dish names shouldn't meet a tag-chip widget.
    knownFor: profile.knownFor.join(", "),
    languages: profile.languages.join(", "),
    prepTimeMins: profile.prepTimeMins?.toString() ?? "",
    responseTimeMins: profile.responseTimeMins?.toString() ?? "",
    capacityPerDay: profile.capacityPerDay?.toString() ?? "",
    minOrderValue: profile.minOrderValue?.toString() ?? "",
    workingDays: [...profile.workingDays],
    opensAt: profile.opensAt ?? "",
    closesAt: profile.closesAt ?? "",
    hygieneNote: profile.hygieneNote ?? "",
    pickupAddressLine1: profile.pickup?.addressLine1 ?? "",
    pickupAddressLine2: profile.pickup?.addressLine2 ?? "",
    pickupLandmark: profile.pickup?.landmark ?? "",
    pickupPincode: profile.pickup?.pincode ?? "",
    pickupPhone: profile.pickup?.phone ?? "",
    packagingNote: profile.packagingNote ?? "",
    cancellationPolicy: profile.cancellationPolicy ?? "",
    returnPolicy: profile.returnPolicy ?? "",
    acceptsCustomOrders: profile.acceptsCustomOrders,
    customOrderPolicy: profile.customOrderPolicy ?? "",
    fssaiNumber: profile.fssaiNumber ?? "",
    instagramUrl: profile.instagramUrl ?? "",
    facebookUrl: profile.facebookUrl ?? "",
    youtubeUrl: profile.youtubeUrl ?? "",
    websiteUrl: profile.websiteUrl ?? "",
  };
}

/** Empty string means "leave it out", not "clear it to empty" — the DTO's fields are all optional. */
function text(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

function list(value: string): string[] | undefined {
  const items = value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  return items.length === 0 ? undefined : items;
}

function num(value: string): number | undefined {
  const parsed = Number(value.trim());
  return value.trim() === "" || Number.isNaN(parsed) ? undefined : parsed;
}

/**
 * `/seller/profile` (M16) — the HomeKrafter's own profile.
 *
 * The completion meter at the top is the point of the page. A blank
 * profile is the default state of every newly approved kitchen, and the
 * only person who can fix it is the one looking at this screen, so the
 * missing sections are named in plain words ("Your story", "Kitchen
 * photos") rather than shown as a percentage and left there.
 *
 * Verification is **read-only** here. The three badges are set by an
 * admin (`PATCH /admin/sellers/:id/verification`) and the server strips
 * them from anything this page sends — a HomeKrafter can submit their
 * FSSAI number, and changing it clears an existing check, because a
 * changed licence has not been checked.
 */
export function SellerProfileClient() {
  const { ready, seller, sellerDataReady, refreshSeller } = useAuth();
  const [profile, setProfile] = useState<OwnVendorProfile | undefined>();
  // Only for the "view live storefront" link — the slug isn't on the
  // session's `seller` claim, and `/seller/storefront` already owns this
  // fetch, so it's a single extra read rather than a new endpoint.
  const [vendorSlug, setVendorSlug] = useState<string | undefined>();
  const [photos, setPhotos] = useState<VendorPhoto[]>([]);
  // Days off (M16, M2). Specific dates, not a recurring rule — the weekly
  // pattern is `workingDays` above, and this is the exception to it.
  const [blackouts, setBlackouts] = useState<VendorBlackout[]>([]);
  const [newBlackout, setNewBlackout] = useState({ date: "", reason: "" });
  const [form, setForm] = useState<FormState | undefined>();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [unavailable, setUnavailable] = useState(false);

  /**
   * What they make (M33), which saves on its own button rather than with
   * the profile below it.
   *
   * Two reasons it is separate. It writes a different row — `Seller`, not
   * `VendorProfile` — through a different endpoint, so bundling it into
   * the profile save would mean one button that half-succeeds. And it is
   * the answer the FSSAI question below depends on: ticking "Homemade
   * food" has to make that field appear *now*, not after saving a page
   * whose licence field was not on screen when they started.
   *
   * `draft` is `undefined` until something is ticked, so the chips render
   * from the account until the moment the HomeKrafter disagrees with it —
   * no seeding effect, and nothing to clobber when the record refreshes
   * underneath.
   */
  const [savedSpecialties, setSavedSpecialties] = useState<SellerSpecialty[] | undefined>();
  const [specialtyDraft, setSpecialtyDraft] = useState<SellerSpecialty[] | undefined>();
  const [savingSpecialties, setSavingSpecialties] = useState(false);
  const [specialtiesSaved, setSpecialtiesSaved] = useState(false);
  const [specialtiesError, setSpecialtiesError] = useState<string | undefined>();

  // Fires as soon as we know a HomeKrafter is signed in: this screen's
  // read is JWT-scoped and ignores the `seller` record (`lib/api`), so
  // waiting for `GET /seller/me` was a round trip in front of a request
  // that never used its answer.
  useEffect(() => {
    if (!sellerDataReady) return;
    let cancelled = false;
    (async () => {
      try {
        const [loaded, vendor, daysOff] = await Promise.all([
          getSellerProfile(),
          getSellerVendor(seller?.vendorId ?? ""),
          getSellerBlackouts(),
        ]);
        if (cancelled) return;
        setVendorSlug(vendor?.slug);
        setBlackouts(daysOff);
        if (!loaded) {
          setUnavailable(true);
          return;
        }
        setProfile(loaded);
        setPhotos(loaded.photos);
        setForm(toForm(loaded));
      } catch (caught) {
        if (cancelled) return;
        if (!isForbidden(caught)) throw caught;
        setUnavailable(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sellerDataReady, seller]);

  const photoUrls = useMemo(() => photos.map((photo) => photo.url), [photos]);

  // The account's list, or the one the last save returned. The local copy
  // wins because mock mode mutates the seed record in place — `seller`
  // keeps its object identity, so reading through it alone would show the
  // previous answer until a reload.
  const currentSpecialties = savedSpecialties ?? seller?.specialties ?? [];
  const selectedSpecialties = specialtyDraft ?? currentSpecialties;
  const specialtiesDirty =
    specialtyDraft !== undefined &&
    (specialtyDraft.length !== currentSpecialties.length ||
      specialtyDraft.some((s) => !currentSpecialties.includes(s)));

  /**
   * A tag the account carries that no group offers — `laundry` or
   * `cleaning` on a partner who predates the M19 withdrawal.
   *
   * It is named rather than hidden, because it is still in
   * `selectedSpecialties` and still gets sent on save. A chip row that
   * silently omits part of the answer looks like the answer.
   */
  const retiredSpecialties = selectedSpecialties.filter(
    (s) => !SPECIALTY_GROUPS.some((group) => group.values.includes(s)),
  );

  function toggleSpecialty(option: SellerSpecialty) {
    setSpecialtyDraft((current) => {
      const base = current ?? currentSpecialties;
      return base.includes(option)
        ? base.filter((x) => x !== option)
        : [...base, option];
    });
    setSpecialtiesSaved(false);
    setSpecialtiesError(undefined);
  }

  async function saveSpecialties() {
    if (specialtyDraft === undefined) return;
    setSavingSpecialties(true);
    setSpecialtiesError(undefined);
    const result = await updateSellerSpecialties(specialtyDraft);
    setSavingSpecialties(false);
    if (!result) {
      setSpecialtiesError("That did not save. Pick at least one and try again.");
      return;
    }
    setSavedSpecialties(result);
    setSpecialtyDraft(undefined);
    setSpecialtiesSaved(true);
    // So every other portal screen reading `specialties` — the snack
    // queue on `/seller/orders`, above all — stops describing the
    // business this kitchen used to be.
    void refreshSeller();
  }

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => (current ? { ...current, [key]: value } : current));
    setSaved(false);
  }

  function toggleDay(day: number) {
    setForm((current) => {
      if (!current) return current;
      const next = current.workingDays.includes(day)
        ? current.workingDays.filter((d) => d !== day)
        : [...current.workingDays, day].sort((a, b) => a - b);
      return { ...current, workingDays: next };
    });
    setSaved(false);
  }

  /**
   * `<PhotoUpload>` owns a list of URLs; the server owns rows with ids.
   * Diffing the two lists here means the upload widget stays the shared
   * one every other photo field uses, rather than growing a special case
   * for this page.
   */
  async function handlePhotos(nextUrls: string[]) {
    const added = nextUrls.filter((url) => !photoUrls.includes(url));
    const removed = photos.filter((photo) => !nextUrls.includes(photo.url));

    for (const photo of removed) {
      const remaining = await removeSellerPhoto(photo.id);
      if (remaining) setPhotos(remaining);
    }
    for (const url of added) {
      const created = await addSellerPhoto({ url });
      if (created) setPhotos((current) => [...current, created]);
    }
  }

  async function handleAddBlackout() {
    if (!newBlackout.date) return;
    const updated = await addSellerBlackout(newBlackout.date, newBlackout.reason.trim() || undefined);
    if (updated) {
      setBlackouts(updated);
      setNewBlackout({ date: "", reason: "" });
    }
  }

  async function handleRemoveBlackout(id: string) {
    const updated = await removeSellerBlackout(id);
    if (updated) setBlackouts(updated);
  }

  async function handleSave() {
    if (!form) return;
    setSaving(true);
    setError(undefined);

    const input: SellerProfileInput = {
      tagline: text(form.tagline),
      story: text(form.story),
      knownFor: list(form.knownFor),
      languages: list(form.languages),
      prepTimeMins: num(form.prepTimeMins),
      responseTimeMins: num(form.responseTimeMins),
      capacityPerDay: num(form.capacityPerDay),
      minOrderValue: num(form.minOrderValue),
      workingDays: form.workingDays.length > 0 ? form.workingDays : undefined,
      opensAt: text(form.opensAt),
      closesAt: text(form.closesAt),
      hygieneNote: text(form.hygieneNote),
      // Sent as "" rather than undefined when cleared, so deleting a
      // landmark actually removes it — the server maps empty to NULL.
      // `text()` would drop it and the old value would survive the save.
      pickupAddressLine1: form.pickupAddressLine1.trim(),
      pickupAddressLine2: form.pickupAddressLine2.trim(),
      pickupLandmark: form.pickupLandmark.trim(),
      pickupPincode: form.pickupPincode.trim(),
      pickupPhone: form.pickupPhone.trim(),
      packagingNote: text(form.packagingNote),
      cancellationPolicy: text(form.cancellationPolicy),
      returnPolicy: text(form.returnPolicy),
      acceptsCustomOrders: form.acceptsCustomOrders,
      customOrderPolicy: text(form.customOrderPolicy),
      fssaiNumber: text(form.fssaiNumber),
      instagramUrl: text(form.instagramUrl),
      facebookUrl: text(form.facebookUrl),
      youtubeUrl: text(form.youtubeUrl),
      websiteUrl: text(form.websiteUrl),
    };

    const updated = await updateSellerProfile(input);
    setSaving(false);
    if (!updated) {
      setError("That did not save. Check the FSSAI number is 14 digits and any links start with https://.");
      return;
    }
    setProfile(updated);
    setPhotos(updated.photos);
    setSaved(true);
  }

  const noStorefront = ready && !!seller && !seller.vendorId;
  if (noStorefront || unavailable) return <ModuleUnavailable module="Profile" />;
  if (!ready || loading || !form || !profile) {
    return <div className={styles.loading}>Loading your profile…</div>;
  }

  /**
   * M22 — an FSSAI licence is a **food** licence, so it is only asked of a
   * HomeKrafter who sells food. Before this, a candle maker's profile
   * showed an unmet "FSSAI licence" badge and a licence-number field on
   * the screen that decides whether they finish setting up: a requirement
   * they cannot meet, for a product it does not apply to.
   *
   * `specialties` decides what the form *asks*, never what they can
   * *reach* — every portal module stays available to everyone.
   *
   * Read off `currentSpecialties`, not `seller`, so that saving "Homemade
   * food" in the card above makes the licence field appear in the same
   * interaction. Off the *saved* list rather than the draft, though: a
   * half-ticked chip row must not flash a licence field on and off.
   */
  const sellsFood = makesFood(currentSpecialties);

  const verifications = [
    { key: "identity", label: "Identity", done: profile.identityVerified },
    { key: "address", label: "Address", done: profile.addressVerified },
    ...(sellsFood ? [{ key: "fssai", label: "FSSAI licence", done: profile.fssaiVerified }] : []),
  ];

  return (
    <div className={styles.page}>
      <SellerPageHeader
        title="Profile"
        subtitle="The story, hours and policies a buyer reads before deciding to order from you."
        actions={
          vendorSlug ? (
            <Link href={`/storefront/${vendorSlug}`} className={styles.previewLink} target="_blank">
              View live storefront →
            </Link>
          ) : undefined
        }
      />

      <Card className={styles.completion} padding="lg">
        <CapacityMeter
          current={profile.completion.percent}
          max={100}
          title="Profile completeness"
          label={`${profile.completion.percent}%`}
        />
        {profile.completion.missing.length === 0 ? (
          <p className={styles.completionNote}>
            Nothing left to fill in. Keep it current as things change.
          </p>
        ) : (
          <>
            <p className={styles.completionNote}>
              Buyers are choosing between kitchens they have never eaten from. These are the things
              they look for that you have not answered yet:
            </p>
            <ul className={styles.missing}>
              {profile.completion.missing.map((item) => (
                <li key={item.key}>{item.label}</li>
              ))}
            </ul>
          </>
        )}
      </Card>

      {/*
        M33, owner brief: "if someone has registered for food, he/she can
        register for gifting partner and other categories under the same
        account".

        There is no second registration to build, and building one would
        have been the wrong answer. One HomeKrafter account has had every
        portal module since M12 and `specialties` has never been allowed
        to gate anything, so this kitchen could already list a candle — a
        second application would only have produced a duplicate for an
        admin to reconcile and a second `Vendor` splitting its own
        reviews, followers and payouts. What was genuinely missing was
        this: the tags were written once at approval and nothing could
        change them afterwards, which is why `/sell` has been promising
        "you can change this later" to every applicant since M22 without
        it being true.
      */}
      <Card className={styles.section} padding="lg">
        <h2 className={styles.sectionTitle}>What you make</h2>
        <p className={styles.hint}>
          This is how buyers find you, and you can change it whenever your kitchen does. Adding a
          category needs no new application and no approval — it is the same account, the same
          storefront and the same payouts. Every individual listing is still reviewed on its own
          before it goes live.
        </p>

        {SPECIALTY_GROUPS.map((group) => (
          <div key={group.label} className={styles.specialtyGroup}>
            <span className={styles.label}>{group.label}</span>
            <div className={styles.chipRow}>
              {group.values.map((option) => (
                <Chip
                  key={option}
                  label={SPECIALTY_LABELS[option]}
                  selected={selectedSpecialties.includes(option)}
                  onClick={() => toggleSpecialty(option)}
                />
              ))}
            </div>
          </div>
        ))}

        {retiredSpecialties.length > 0 && (
          <p className={styles.hint}>
            Your account also carries{" "}
            {retiredSpecialties.map((s) => SPECIALTY_LABELS[s]).join(" and ")}, from a service
            Homekrafted no longer runs. It stays on your account so your old bookings still open,
            and it cannot be added back.
          </p>
        )}

        {selectedSpecialties.length === 0 && (
          <p className={styles.hint}>
            Pick at least one — an untagged storefront turns up in no filter.
          </p>
        )}

        {/* Its own save, not the page's — see the state block's comment. */}
        <div className={styles.specialtyActions}>
          <Button
            variant="secondary"
            onClick={saveSpecialties}
            disabled={!specialtiesDirty || selectedSpecialties.length === 0 || savingSpecialties}
          >
            {savingSpecialties ? "Saving…" : "Save what you make"}
          </Button>
          <span className={styles.status} role="status" aria-live="polite">
            {specialtiesError ??
              (specialtiesSaved && !specialtiesDirty
                ? "Saved. Buyers can find you under these now."
                : "")}
          </span>
        </div>
      </Card>

      <Card className={styles.section} padding="lg">
        <h2 className={styles.sectionTitle}>Verification</h2>
        <p className={styles.hint}>
          Homekrafted checks these — you cannot set them yourself, and that is what makes them worth
          something to a buyer. Submit your licence number below and we will get to it.
        </p>
        <ul className={styles.verifications}>
          {verifications.map((item) => (
            <li key={item.key} className={item.done ? styles.verified : styles.unverified}>
              {item.done ? <BadgeCheck size={16} aria-hidden="true" /> : <ShieldAlert size={16} aria-hidden="true" />}
              <span>
                {item.label}
                <span className={styles.verificationState}>
                  {item.done ? "Verified" : "Not verified yet"}
                </span>
              </span>
            </li>
          ))}
        </ul>
        {profile.verificationNote && (
          <p className={styles.verificationNote}>
            <strong>Note from Homekrafted:</strong> {profile.verificationNote}
          </p>
        )}
        {sellsFood && (
          <label className={styles.field}>
            <span className={styles.label}>FSSAI licence number</span>
            <input
              className={styles.input}
              value={form.fssaiNumber}
              inputMode="numeric"
              placeholder="14 digits"
              onChange={(event) => set("fssaiNumber", event.target.value)}
            />
            <span className={styles.hint}>
              Changing this clears an existing verification — a new number has to be checked again.
            </span>
          </label>
        )}
      </Card>

      {/*
        Where a rider collects (M36b, editable since M36c).

        It shipped read-only on the reasoning that a courier may already
        be routing to it. That was protecting an edge case by leaving
        every kitchen that moves with a wrong address and a support
        ticket, so the answer is the warning below rather than a locked
        field.

        Changing any line clears `addressVerified` server-side — the same
        rule `fssaiNumber` follows, and for the same reason: a badge that
        survives an edit to the thing it verifies is a badge the seller
        set themselves. The hint says so, because a verification silently
        disappearing is worse than one you were told you were spending.
      */}
      <Card className={styles.section} padding="lg">
        <h2 className={styles.sectionTitle}>Where we collect from</h2>
        <p className={styles.hint}>
          <strong>Shoppers never see this.</strong>{" "}
          It is used only to arrange pickups — on your storefront they see your
          area, never your street or house number.
        </p>
        <div className={styles.grid}>
          <label className={styles.field}>
            <span className={styles.label}>House / shop number and street</span>
            <input
              className={styles.input}
              value={form.pickupAddressLine1}
              autoComplete="address-line1"
              onChange={(event) => set("pickupAddressLine1", event.target.value)}
            />
          </label>
          <label className={styles.field}>
            <span className={styles.label}>Area or colony</span>
            <input
              className={styles.input}
              value={form.pickupAddressLine2}
              autoComplete="address-line2"
              onChange={(event) => set("pickupAddressLine2", event.target.value)}
            />
          </label>
          <label className={styles.field}>
            <span className={styles.label}>Landmark</span>
            <input
              className={styles.input}
              value={form.pickupLandmark}
              placeholder="e.g. opposite the gurudwara"
              onChange={(event) => set("pickupLandmark", event.target.value)}
            />
          </label>
          <label className={styles.field}>
            <span className={styles.label}>Pincode</span>
            <input
              className={styles.input}
              value={form.pickupPincode}
              inputMode="numeric"
              onChange={(event) =>
                set("pickupPincode", event.target.value.replace(/\D/g, "").slice(0, 6))
              }
            />
          </label>
          <label className={styles.field}>
            <span className={styles.label}>A different number for pickups</span>
            <input
              className={styles.input}
              type="tel"
              value={form.pickupPhone}
              onChange={(event) => set("pickupPhone", event.target.value)}
            />
          </label>
        </div>
        <p className={styles.hint}>
          Moving? Change it here — but tell us too if you have orders out, because a
          courier may already be routing to the old one. Changing your address also
          clears the <strong>Kitchen address</strong> verification above, since we
          checked the old one; we will re-check the new address.
        </p>
      </Card>

      <Card className={styles.section} padding="lg">
        <h2 className={styles.sectionTitle}>Your story</h2>
        <label className={styles.field}>
          <span className={styles.label}>Tagline</span>
          <input
            className={styles.input}
            value={form.tagline}
            maxLength={120}
            placeholder="One line about what you cook and why"
            onChange={(event) => set("tagline", event.target.value)}
          />
        </label>
        <Textarea
          label="The longer version"
          rows={8}
          value={form.story}
          hint="How you started, what you make, what you refuse to compromise on. Leave a blank line between paragraphs."
          onChange={(event) => set("story", event.target.value)}
        />
        <div className={styles.row}>
          <label className={styles.field}>
            <span className={styles.label}>Known for</span>
            <input
              className={styles.input}
              value={form.knownFor}
              placeholder="Mango thokku, Punjabi thali"
              onChange={(event) => set("knownFor", event.target.value)}
            />
            <span className={styles.hint}>Comma separated.</span>
          </label>
          <label className={styles.field}>
            <span className={styles.label}>Languages you take orders in</span>
            <input
              className={styles.input}
              value={form.languages}
              placeholder="Hindi, Punjabi, English"
              onChange={(event) => set("languages", event.target.value)}
            />
            <span className={styles.hint}>Comma separated.</span>
          </label>
        </div>
      </Card>

      <Card className={styles.section} padding="lg">
        <h2 className={styles.sectionTitle}>{sellsFood ? "Inside your kitchen" : "Inside your workshop"}</h2>
        <p className={styles.hint}>
          Photos of the place it is actually made. This is the single thing buyers ask for most
          and the hardest for a competitor to fake.
        </p>
        <PhotoUpload
          photos={photoUrls}
          onChange={handlePhotos}
          purpose="storefront"
          maxPhotos={12}
          label={sellsFood ? "Kitchen photos" : "Workshop photos"}
        />
      </Card>

      <Card className={styles.section} padding="lg">
        <h2 className={styles.sectionTitle}>How you work</h2>
        <fieldset className={styles.fieldset}>
          <legend className={styles.label}>Days you cook</legend>
          <div className={styles.days}>
            {DAYS.map((day) => {
              const on = form.workingDays.includes(day.value);
              return (
                <button
                  key={day.value}
                  type="button"
                  className={on ? styles.dayOn : styles.dayOff}
                  aria-pressed={on}
                  onClick={() => toggleDay(day.value)}
                >
                  {day.label}
                </button>
              );
            })}
          </div>
        </fieldset>
        <div className={styles.row}>
          <label className={styles.field}>
            <span className={styles.label}>Opens</span>
            <input
              className={styles.input}
              type="time"
              value={form.opensAt}
              onChange={(event) => set("opensAt", event.target.value)}
            />
          </label>
          <label className={styles.field}>
            <span className={styles.label}>Closes</span>
            <input
              className={styles.input}
              type="time"
              value={form.closesAt}
              onChange={(event) => set("closesAt", event.target.value)}
            />
          </label>
        </div>
        <div className={styles.row}>
          <label className={styles.field}>
            <span className={styles.label}>Preparation time (minutes)</span>
            <input
              className={styles.input}
              inputMode="numeric"
              value={form.prepTimeMins}
              placeholder="180"
              onChange={(event) => set("prepTimeMins", event.target.value)}
            />
            <span className={styles.hint}>How long you need between an order and it being ready.</span>
          </label>
          <label className={styles.field}>
            <span className={styles.label}>You usually reply within (minutes)</span>
            <input
              className={styles.input}
              inputMode="numeric"
              value={form.responseTimeMins}
              placeholder="30"
              onChange={(event) => set("responseTimeMins", event.target.value)}
            />
          </label>
        </div>
        <fieldset className={styles.fieldset}>
          <legend className={styles.label}>Days off</legend>
          <span className={styles.hint}>
            Specific dates you are not cooking — a festival, travel, a batch already sold out.
            Buyers see these struck out on the delivery picker with your reason, so nobody books a
            day you cannot make.
          </span>
          {blackouts.length > 0 && (
            <ul className={styles.blackouts}>
              {blackouts.map((blackout) => (
                <li key={blackout.id} className={styles.blackout}>
                  <span>
                    {formatDate(blackout.date)}
                    {blackout.reason ? ` — ${blackout.reason}` : ""}
                  </span>
                  <button
                    type="button"
                    className={styles.removeBlackout}
                    onClick={() => handleRemoveBlackout(blackout.id)}
                    aria-label={`Remove day off on ${formatDate(blackout.date)}`}
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className={styles.blackoutForm}>
            <input
              type="date"
              className={styles.input}
              value={newBlackout.date}
              aria-label="Date you are closed"
              onChange={(event) => setNewBlackout((c) => ({ ...c, date: event.target.value }))}
            />
            <input
              className={styles.input}
              value={newBlackout.reason}
              maxLength={80}
              placeholder="Reason (optional) — e.g. Closed for Diwali"
              aria-label="Reason"
              onChange={(event) => setNewBlackout((c) => ({ ...c, reason: event.target.value }))}
            />
            <Button
              variant="secondary"
              size="sm"
              onClick={handleAddBlackout}
              disabled={!newBlackout.date}
            >
              Add day off
            </Button>
          </div>
        </fieldset>

        <div className={styles.row}>
          <label className={styles.field}>
            <span className={styles.label}>Orders you can take in a day</span>
            <input
              className={styles.input}
              inputMode="numeric"
              value={form.capacityPerDay}
              placeholder="25"
              onChange={(event) => set("capacityPerDay", event.target.value)}
            />
            <span className={styles.hint}>
              Being honest here is what stops a festival rush turning into cancellations.
            </span>
          </label>
          <label className={styles.field}>
            <span className={styles.label}>Minimum order (₹)</span>
            <input
              className={styles.input}
              inputMode="numeric"
              value={form.minOrderValue}
              placeholder="250"
              onChange={(event) => set("minOrderValue", event.target.value)}
            />
          </label>
        </div>
      </Card>

      <Card className={styles.section} padding="lg">
        <h2 className={styles.sectionTitle}>Hygiene, packaging and policies</h2>
        <Textarea
          label="How you handle hygiene"
          rows={3}
          value={form.hygieneNote}
          hint="The most asked question about home food. Answer it in your own words."
          onChange={(event) => set("hygieneNote", event.target.value)}
        />
        <Textarea
          label="How you pack an order"
          rows={3}
          value={form.packagingNote}
          onChange={(event) => set("packagingNote", event.target.value)}
        />
        <Textarea
          label="Cancellations"
          rows={3}
          value={form.cancellationPolicy}
          hint="Buyers can cancel until an order is packed. Say what happens after that."
          onChange={(event) => set("cancellationPolicy", event.target.value)}
        />
        <Textarea
          label="Returns"
          rows={3}
          value={form.returnPolicy}
          hint="A buyer has 7 days after delivery to raise a return. Say what you will and will not take back."
          onChange={(event) => set("returnPolicy", event.target.value)}
        />
        <label className={styles.checkbox}>
          <input
            type="checkbox"
            checked={form.acceptsCustomOrders}
            onChange={(event) => set("acceptsCustomOrders", event.target.checked)}
          />
          <span>I take custom and bulk orders</span>
        </label>
        {form.acceptsCustomOrders && (
          <Textarea
            label="Custom order terms"
            rows={3}
            value={form.customOrderPolicy}
            hint="Notice you need, minimums, anything you will not do."
            onChange={(event) => set("customOrderPolicy", event.target.value)}
          />
        )}
      </Card>

      <Card className={styles.section} padding="lg">
        <h2 className={styles.sectionTitle}>Where else you are</h2>
        <div className={styles.row}>
          <label className={styles.field}>
            <span className={styles.label}>Instagram</span>
            <input
              className={styles.input}
              value={form.instagramUrl}
              placeholder="https://instagram.com/…"
              onChange={(event) => set("instagramUrl", event.target.value)}
            />
          </label>
          <label className={styles.field}>
            <span className={styles.label}>Facebook</span>
            <input
              className={styles.input}
              value={form.facebookUrl}
              placeholder="https://facebook.com/…"
              onChange={(event) => set("facebookUrl", event.target.value)}
            />
          </label>
        </div>
        <div className={styles.row}>
          <label className={styles.field}>
            <span className={styles.label}>YouTube</span>
            <input
              className={styles.input}
              value={form.youtubeUrl}
              placeholder="https://youtube.com/…"
              onChange={(event) => set("youtubeUrl", event.target.value)}
            />
          </label>
          <label className={styles.field}>
            <span className={styles.label}>Website</span>
            <input
              className={styles.input}
              value={form.websiteUrl}
              placeholder="https://…"
              onChange={(event) => set("websiteUrl", event.target.value)}
            />
          </label>
        </div>
      </Card>

      <div className={styles.actions}>
        <Button variant="primary" onClick={handleSave} disabled={saving}>
          {saving ? "Saving…" : "Save profile"}
        </Button>
        <span className={styles.status} role="status" aria-live="polite">
          {error ?? (saved ? "Saved." : "")}
        </span>
      </div>
    </div>
  );
}
