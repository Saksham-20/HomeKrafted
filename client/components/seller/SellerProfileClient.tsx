"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { BadgeCheck, MapPin, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { CapacityMeter } from "@/components/ui/CapacityMeter";
import { Chip } from "@/components/ui/Chip";
import { PhotoUpload } from "@/components/ui/PhotoUpload";
import {
  CheckRow,
  ChipRow,
  Field,
  FieldGrid,
  Fieldset,
  Input,
  TextArea,
} from "@/components/portal/Field";
import { FormPage, type FormPageSection } from "@/components/portal/FormPage";
import { FormSection, type FormSectionStatus } from "@/components/portal/FormSection";
import { LoadingRows } from "@/components/portal/LoadingRows";
import { Notice } from "@/components/portal/Notice";
import { SaveBar } from "@/components/portal/SaveBar";
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
  setSellerKitchenPin,
  updateSellerProfile,
  updateSellerSpecialties,
  type SellerProfileInput,
} from "@/lib/api";
import { apiErrorMessage } from "@/lib/api/errors";
import { formatDate } from "@/lib/format";
import { kitchenLoading, MAKER_LOADING } from "@/lib/kitchen-copy";
import { isDirty } from "@/lib/portal/dirty";
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
 * The page's sections, in reading order, and which completion keys
 * (`VendorProfileService`'s `completion.missing`) each one answers. The
 * jump-nav and every section's status chip are derived from this one
 * list, so "2 to fill" beside a heading and "2" in the nav cannot
 * disagree. Keys the server does not emit for this kitchen (`fssai` for
 * a candle maker) simply never show up as missing.
 */
const SECTIONS: { id: string; label: string; keys: string[] }[] = [
  { id: "makes", label: "What you make", keys: [] },
  { id: "story", label: "Your story", keys: ["tagline", "story", "knownFor"] },
  { id: "photos", label: "Photos", keys: ["photos"] },
  { id: "hours", label: "How you work", keys: ["hours", "prep"] },
  { id: "policies", label: "Policies", keys: ["hygiene", "policies"] },
  { id: "verification", label: "Verification", keys: ["fssai"] },
  { id: "address", label: "Address & pin", keys: ["pin"] },
  { id: "links", label: "Links", keys: [] },
];

/**
 * `/seller/profile` (M16, rebuilt 2026-09-04) — the HomeKrafter's own
 * profile: the story, hours, policies and licence a buyer reads before
 * trusting a stranger's kitchen.
 *
 * **What changed and why.** It was nine cards in a 4,800px column with
 * one Save button at the bottom and a completion meter at the top that
 * named the gaps and linked to none of them. Now every section is a
 * `FormSection` with an anchor and a status chip, a sticky jump-nav
 * lists them with what each still needs, and a `SaveBar` at the bottom
 * says whether there is anything to save and whether the last save
 * landed. The fields themselves moved from the 11px mono captions to the
 * shared `Field` recipe — the same words, readable.
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
  // The kitchen pin (2026-08-18). The pin itself lives on `profile.pin`;
  // these three are only the fetch-a-GPS-fix interaction around it.
  const [pinBusy, setPinBusy] = useState(false);
  const [pinStatus, setPinStatus] = useState<string | undefined>();
  const [pinError, setPinError] = useState<string | undefined>();
  const [form, setForm] = useState<FormState | undefined>();
  /** What the form was loaded (or last saved) with — the SaveBar's baseline. */
  const [initialForm, setInitialForm] = useState<FormState | undefined>();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [unavailable, setUnavailable] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

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
        const initial = toForm(loaded);
        setForm(initial);
        setInitialForm(initial);
      } catch (caught) {
        if (cancelled) return;
        if (isForbidden(caught)) {
          setUnavailable(true);
          return;
        }
        // A failed read is not an empty screen. Rethrowing here reached no
        // boundary (an effect's rejection is not a render error), so a
        // rate-limited fetch rendered the empty state over real data — the
        // M37 dashboard rule, applied to every list (2026-09-04).
        setLoadError(apiErrorMessage(caught, "Couldn't load your kitchen's details. Try again."));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sellerDataReady, seller, reloadToken]);

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
    try {
      const result = await updateSellerSpecialties(specialtyDraft);
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
    } catch (err) {
      // M33 refuses a payload that newly adds a withdrawn tag, with a
      // sentence saying which one. Swallowed, that read as a dead button.
      setSpecialtiesError(
        apiErrorMessage(err, "That did not save. Pick at least one and try again."),
      );
    } finally {
      setSavingSpecialties(false);
    }
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

    // One failure must not abandon the rest of the batch *silently*.
    // `removeSellerPhoto` throws since M36, and an uncaught rejection here
    // stopped the loop mid-way: some photos gone, some still listed, and
    // the widget showing neither state accurately.
    try {
      for (const photo of removed) {
        const remaining = await removeSellerPhoto(photo.id);
        if (remaining) setPhotos(remaining);
      }
      for (const url of added) {
        const created = await addSellerPhoto({ url });
        if (created) setPhotos((current) => [...current, created]);
      }
    } catch (err) {
      setError(apiErrorMessage(err, "Couldn't update your photos. Try again."));
    }
  }

  async function handleAddBlackout() {
    if (!newBlackout.date) return;
    try {
      const updated = await addSellerBlackout(newBlackout.date, newBlackout.reason.trim() || undefined);
      if (updated) {
        setBlackouts(updated);
        setNewBlackout({ date: "", reason: "" });
      }
    } catch (err) {
      setError(apiErrorMessage(err, "Couldn't add that day off. Try again."));
    }
  }

  async function handleRemoveBlackout(id: string) {
    try {
      const updated = await removeSellerBlackout(id);
      if (updated) setBlackouts(updated);
    } catch (err) {
      // Silently failing here leaves a day the kitchen believes they
      // reopened still closed, and they find out from a missing order.
      setError(apiErrorMessage(err, "Couldn't remove that day off. Try again."));
    }
  }

  /**
   * "Use my current location" — the person is standing in the kitchen, so
   * their GPS fix *is* the kitchen. The save is server-checked against
   * their pincode/area (a fix from the wrong city comes back as a 400
   * whose sentence we show verbatim), clears the address verification,
   * and never changes what a buyer sees — the storefront always carries a
   * ~1 km rounded point, whoever set the pin.
   *
   * `geolocation` is browser-only, which is fine: this fires from a
   * click, never during render, so there is no SSR/hydration clock to
   * disagree with (the M12 rule).
   */
  function handlePinKitchen() {
    if (!("geolocation" in navigator)) {
      setPinError("This browser cannot share a location. Open this page on your phone and try again.");
      return;
    }
    setPinBusy(true);
    setPinError(undefined);
    setPinStatus(undefined);
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          const savedPin = await setSellerKitchenPin({
            lat: position.coords.latitude,
            lng: position.coords.longitude,
          });
          // One update carries both facts: the new pin, and the badge it
          // cost — the verification list reads `addressVerified` off this
          // same object.
          setProfile((current) =>
            current
              ? {
                  ...current,
                  addressVerified: savedPin.addressVerified,
                  pin: {
                    ...current.pin,
                    lat: savedPin.lat,
                    lng: savedPin.lng,
                    confirmedAt: new Date().toISOString(),
                  },
                }
              : current,
          );
          const accuracy = Math.round(position.coords.accuracy);
          setPinStatus(
            accuracy > 250
              ? `Saved, but the fix was only accurate to about ${accuracy} m — try again near a window or outside for a tighter one.`
              : "Saved. We will re-check your address, since the spot we verified has moved.",
          );
        } catch (err) {
          // The server's refusal names the distance and what to do next —
          // never swallow it (the M36 rule).
          setPinError(apiErrorMessage(err, "We could not save that pin. Try again."));
        } finally {
          setPinBusy(false);
        }
      },
      (geoError) => {
        setPinBusy(false);
        setPinError(
          geoError.code === geoError.PERMISSION_DENIED
            ? "Location is blocked for this site. Allow it in your browser settings, then press the button again — standing in your kitchen."
            : "We could not get a location fix. Move near a window or step outside, then try again.",
        );
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    );
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

    // `updateSellerProfile` stopped swallowing its own refusals in M36,
    // which is right — but a bare `await` on an unswallowed wrapper is
    // worse than the swallow was. The rejection skips `setSaving(false)`
    // as well as the message, so the button stays on "Saving…" forever
    // and the only trace is an unhandled rejection in a console nobody
    // has open. `finally` implies `catch`, the rule
    // `lib/silent-failure.spec.ts` exists to enforce.
    try {
      const updated = await updateSellerProfile(input);
      if (!updated) {
        setError("That did not save. Check the FSSAI number is 14 digits and any links start with https://.");
        return;
      }
      setProfile(updated);
      setPhotos(updated.photos);
      // The saved row becomes the new baseline, so the bar reads "Saved"
      // rather than "Unsaved changes" against the state it just wrote.
      const next = toForm(updated);
      setForm(next);
      setInitialForm(next);
      setSaved(true);
    } catch (err) {
      // The server's own sentence where there is one — it names the field
      // and what is wrong with it, which no fallback string can.
      setError(
        apiErrorMessage(
          err,
          "That did not save. Check the FSSAI number is 14 digits and any links start with https://.",
        ),
      );
    } finally {
      setSaving(false);
    }
  }

  function handleDiscard() {
    if (initialForm) setForm(initialForm);
    setError(undefined);
    setSaved(false);
  }

  const noStorefront = ready && !!seller && !seller.vendorId;
  if (loadError) {
    return (
      <div>
        <SellerPageHeader title="About your kitchen" />
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

  if (noStorefront || unavailable) return <ModuleUnavailable module="Profile" />;
  if (!ready || loading || !form || !profile) {
    return (
      <div>
        <SellerPageHeader title="About your kitchen" />
        <LoadingRows rows={4} showLabel label={kitchenLoading("seller/profile", MAKER_LOADING)} />
      </div>
    );
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
  const verifiedCount = verifications.filter((item) => item.done).length;

  const missingKeys = new Set(profile.completion.missing.map((item) => item.key));
  const todoFor = (id: string) =>
    (SECTIONS.find((s) => s.id === id)?.keys ?? []).filter((key) => missingKeys.has(key)).length;
  const navSections: FormPageSection[] = SECTIONS.map((section) => {
    const todo = todoFor(section.id);
    const label =
      section.id === "photos" ? (sellsFood ? "Kitchen photos" : "Workshop photos") : section.label;
    // Only sections that answer a completion key can be "done"; the
    // rest have no status to claim. Verification is special-cased below:
    // a submitted licence is not a verified one.
    const done =
      section.id !== "verification" && section.keys.length > 0 && todo === 0;
    return { id: section.id, label, todo, done };
  });
  const statusFor = (id: string): FormSectionStatus | undefined => {
    const section = SECTIONS.find((s) => s.id === id);
    if (!section || section.keys.length === 0 || id === "verification") return undefined;
    const todo = todoFor(id);
    return todo > 0 ? { label: `${todo} to fill`, tone: "todo" } : { label: "Complete", tone: "done" };
  };

  const dirty = isDirty(initialForm, form);

  return (
    <div className={styles.page}>
      <SellerPageHeader
        title="About your kitchen"
        subtitle="The story, hours and policies a buyer reads before deciding to order from you."
        actions={
          vendorSlug ? (
            <Link href={`/storefront/${vendorSlug}`} className={styles.previewLink} target="_blank">
              View live storefront →
            </Link>
          ) : undefined
        }
      />

      <FormPage sections={navSections} navLabel="Sections">
        {/* The meter stays; the list of gaps it used to print moved into
            the jump-nav, where each gap is a link to the section that
            closes it. */}
        <Card className={styles.completion} padding="md">
          <CapacityMeter
            current={profile.completion.percent}
            max={100}
            title="Profile completeness"
            label={`${profile.completion.percent}%`}
          />
          <p className={styles.completionNote}>
            {profile.completion.missing.length === 0
              ? "Nothing left to fill in. Keep it current as things change."
              : `Buyers are choosing between kitchens they have never eaten from. ${profile.completion.missing.length} thing${profile.completion.missing.length === 1 ? "" : "s"} they look for ${profile.completion.missing.length === 1 ? "is" : "are"} still blank — each section says what it needs.`}
          </p>
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
        <FormSection
          id="makes"
          title="What you make"
          description="How buyers find you. Adding a category needs no new application — same account, same storefront, same payouts. Each listing is still reviewed on its own before it goes live."
          footer={
            /* Its own save, not the page's — see the state block's comment. */
            <>
              <Button
                variant="secondary"
                size="sm"
                onClick={saveSpecialties}
                disabled={!specialtiesDirty || selectedSpecialties.length === 0 || savingSpecialties}
              >
                {savingSpecialties ? "Saving…" : "Save what you make"}
              </Button>
              <span
                className={specialtiesError ? styles.statusError : styles.status}
                role="status"
                aria-live="polite"
              >
                {specialtiesError ??
                  (specialtiesSaved && !specialtiesDirty
                    ? "Saved. Buyers can find you under these now."
                    : specialtiesDirty
                      ? "Changed — save to apply."
                      : "")}
              </span>
            </>
          }
        >
          {SPECIALTY_GROUPS.map((group) => (
            <Fieldset key={group.label} legend={group.label}>
              <ChipRow>
                {group.values.map((option) => (
                  <Chip
                    key={option}
                    label={SPECIALTY_LABELS[option]}
                    selected={selectedSpecialties.includes(option)}
                    onClick={() => toggleSpecialty(option)}
                  />
                ))}
              </ChipRow>
            </Fieldset>
          ))}

          {retiredSpecialties.length > 0 && (
            <p className={styles.note}>
              Your account also carries{" "}
              {retiredSpecialties.map((s) => SPECIALTY_LABELS[s]).join(" and ")}, from a service
              Homekrafted no longer runs. It stays on your account so your old bookings still open,
              and it cannot be added back.
            </p>
          )}

          {selectedSpecialties.length === 0 && (
            <p className={styles.note}>Pick at least one — an untagged storefront turns up in no filter.</p>
          )}
        </FormSection>

        <FormSection
          id="story"
          title="Your story"
          status={statusFor("story")}
          description="Who is cooking, and why somebody should trust it. This is the first thing a buyer reads on your storefront."
        >
          <Field label="Tagline" hint="One line about what you make and why.">
            <Input
              value={form.tagline}
              maxLength={120}
              placeholder="Andhra pickles the way my grandmother made them"
              onChange={(event) => set("tagline", event.target.value)}
            />
          </Field>
          <Field
            label="The longer version"
            hint="How you started, what you make, what you refuse to compromise on. Leave a blank line between paragraphs."
          >
            <TextArea
              rows={6}
              autoGrow
              maxRows={18}
              value={form.story}
              onChange={(event) => set("story", event.target.value)}
            />
          </Field>
          <FieldGrid>
            <Field label="Known for" hint="Comma separated.">
              <Input
                value={form.knownFor}
                placeholder="Mango thokku, Punjabi thali"
                onChange={(event) => set("knownFor", event.target.value)}
              />
            </Field>
            <Field label="Languages you take orders in" hint="Comma separated." optional>
              <Input
                value={form.languages}
                placeholder="Hindi, Punjabi, English"
                onChange={(event) => set("languages", event.target.value)}
              />
            </Field>
          </FieldGrid>
        </FormSection>

        <FormSection
          id="photos"
          title={sellsFood ? "Inside your kitchen" : "Inside your workshop"}
          status={statusFor("photos")}
          description="Photos of the place it is actually made. This is the single thing buyers ask for most, and the hardest for a competitor to fake."
        >
          <PhotoUpload
            photos={photoUrls}
            onChange={handlePhotos}
            purpose="storefront"
            maxPhotos={12}
            label={sellsFood ? "Kitchen photos" : "Workshop photos"}
          />
        </FormSection>

        <FormSection
          id="hours"
          title="How you work"
          status={statusFor("hours")}
          description="Your days, hours and lead time decide which delivery slots a buyer is offered. Nothing here is a commitment to cook more than you can."
        >
          <Fieldset legend={sellsFood ? "Days you cook" : "Days you work"}>
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
          </Fieldset>
          <FieldGrid>
            <Field label="Opens">
              <Input
                type="time"
                value={form.opensAt}
                onChange={(event) => set("opensAt", event.target.value)}
              />
            </Field>
            <Field label="Closes">
              <Input
                type="time"
                value={form.closesAt}
                onChange={(event) => set("closesAt", event.target.value)}
              />
            </Field>
          </FieldGrid>
          <FieldGrid>
            <Field
              label="Preparation time"
              hint="How long you need between an order and it being ready."
            >
              <Input
                inputMode="numeric"
                value={form.prepTimeMins}
                placeholder="180"
                affixEnd="min"
                onChange={(event) => set("prepTimeMins", event.target.value)}
              />
            </Field>
            <Field label="You usually reply within" optional>
              <Input
                inputMode="numeric"
                value={form.responseTimeMins}
                placeholder="30"
                affixEnd="min"
                onChange={(event) => set("responseTimeMins", event.target.value)}
              />
            </Field>
          </FieldGrid>
          <FieldGrid>
            <Field
              label="Orders you can take in a day"
              optional
              hint="Being honest here is what stops a festival rush turning into cancellations."
            >
              <Input
                inputMode="numeric"
                value={form.capacityPerDay}
                placeholder="25"
                onChange={(event) => set("capacityPerDay", event.target.value)}
              />
            </Field>
            <Field label="Minimum order" optional>
              <Input
                inputMode="numeric"
                value={form.minOrderValue}
                placeholder="250"
                affixStart="₹"
                onChange={(event) => set("minOrderValue", event.target.value)}
              />
            </Field>
          </FieldGrid>

          <Fieldset
            legend="Days off"
            hint="Specific dates you are not working — a festival, travel, a batch already sold out. Buyers see these struck out on the delivery picker with your reason, so nobody books a day you cannot make. These save on their own, straight away."
          >
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
              <Input
                type="date"
                dense
                value={newBlackout.date}
                aria-label="Date you are closed"
                onChange={(event) => setNewBlackout((c) => ({ ...c, date: event.target.value }))}
              />
              <Input
                dense
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
          </Fieldset>
        </FormSection>

        <FormSection
          id="policies"
          title="Hygiene, packaging and policies"
          status={statusFor("policies")}
          description="Answer the questions a careful buyer would ask before ordering from a home kitchen. Two or three sentences each is plenty."
        >
          <Field
            label="How you handle hygiene"
            hint="The most asked question about home food. Answer it in your own words."
          >
            <TextArea rows={2} autoGrow value={form.hygieneNote} onChange={(event) => set("hygieneNote", event.target.value)} />
          </Field>
          <Field label="How you pack an order">
            <TextArea rows={2} autoGrow value={form.packagingNote} onChange={(event) => set("packagingNote", event.target.value)} />
          </Field>
          <FieldGrid>
            <Field
              label="Cancellations"
              hint="Buyers can cancel until an order is packed. Say what happens after that."
            >
              <TextArea rows={3} autoGrow value={form.cancellationPolicy} onChange={(event) => set("cancellationPolicy", event.target.value)} />
            </Field>
            <Field
              label="Returns"
              hint="A buyer has 7 days after delivery to raise a return. Say what you will and will not take back."
            >
              <TextArea rows={3} autoGrow value={form.returnPolicy} onChange={(event) => set("returnPolicy", event.target.value)} />
            </Field>
          </FieldGrid>
          <CheckRow
            label="I take custom and bulk orders"
            help="Shows a 'custom orders welcome' line on your storefront and unlocks the terms box below."
            checked={form.acceptsCustomOrders}
            onChange={(event) => set("acceptsCustomOrders", event.target.checked)}
          />
          {form.acceptsCustomOrders && (
            <Field label="Custom order terms" hint="Notice you need, minimums, anything you will not do.">
              <TextArea rows={2} autoGrow value={form.customOrderPolicy} onChange={(event) => set("customOrderPolicy", event.target.value)} />
            </Field>
          )}
        </FormSection>

        <FormSection
          id="verification"
          title="Verification"
          status={{
            label: `${verifiedCount} of ${verifications.length} verified`,
            tone: verifiedCount === verifications.length ? "done" : "neutral",
          }}
          description="Homekrafted checks these — you cannot set them yourself, and that is what makes them worth something to a buyer."
        >
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
            <Notice tone="warning" title="Note from Homekrafted" className={styles.inlineNotice}>
              {profile.verificationNote}
            </Notice>
          )}
          {sellsFood && (
            <Field
              label="FSSAI licence number"
              hint="14 digits. Submit it and we will check it. Changing it clears an existing verification — a new number has to be checked again."
            >
              <Input
                value={form.fssaiNumber}
                inputMode="numeric"
                placeholder="14 digits"
                onChange={(event) => set("fssaiNumber", event.target.value)}
              />
            </Field>
          )}
        </FormSection>

        {/*
          Where a rider collects (M36b, editable since M36c), and the pin
          behind delivery-distance filtering (2026-08-18) — one section,
          because they are one fact about one place. Both are private:
          the storefront only ever shows the area and a ~1 km rounded
          point. Changing any address line, or setting the pin, clears
          `addressVerified` server-side — a badge that survives an edit to
          the thing it verifies is a badge the seller set themselves.
        */}
        <FormSection
          id="address"
          title="Pickup address and kitchen pin"
          status={statusFor("address")}
          description={
            <>
              <strong>Shoppers never see this.</strong> It is used only to arrange pickups and to
              work out which nearby buyers can find you — on your storefront they see your area,
              never your street or house number.
            </>
          }
        >
          <FieldGrid>
            <Field label="House / shop number and street" span="full">
              <Input
                value={form.pickupAddressLine1}
                autoComplete="address-line1"
                onChange={(event) => set("pickupAddressLine1", event.target.value)}
              />
            </Field>
            <Field label="Area or colony">
              <Input
                value={form.pickupAddressLine2}
                autoComplete="address-line2"
                onChange={(event) => set("pickupAddressLine2", event.target.value)}
              />
            </Field>
            <Field label="Landmark" optional>
              <Input
                value={form.pickupLandmark}
                placeholder="e.g. opposite the gurudwara"
                onChange={(event) => set("pickupLandmark", event.target.value)}
              />
            </Field>
            <Field label="Pincode">
              <Input
                value={form.pickupPincode}
                inputMode="numeric"
                onChange={(event) =>
                  set("pickupPincode", event.target.value.replace(/\D/g, "").slice(0, 6))
                }
              />
            </Field>
            <Field label="A different number for pickups" optional>
              <Input
                type="tel"
                value={form.pickupPhone}
                onChange={(event) => set("pickupPhone", event.target.value)}
              />
            </Field>
          </FieldGrid>
          <p className={styles.note}>
            Moving? Change it here — but tell us too if you have orders out, because a courier may
            already be routing to the old one. Changing your address clears the <strong>Address</strong>{" "}
            verification above; we will re-check the new one.
          </p>

          <div className={styles.pinBlock}>
            <MapPin size={18} strokeWidth={1.8} aria-hidden="true" className={styles.pinIcon} />
            <div className={styles.pinBody}>
              <span className={styles.pinTitle}>Your kitchen&apos;s exact spot</span>
              <p className={styles.pinText}>
                {profile.pin
                  ? profile.pin.confirmedAt
                    ? `Pinned at ${profile.pin.lat.toFixed(5)}, ${profile.pin.lng.toFixed(5)} on ${formatDate(profile.pin.confirmedAt)}.`
                    : `Currently placed at ${profile.pin.lat.toFixed(5)}, ${profile.pin.lng.toFixed(5)}` +
                      (profile.pin.pincode
                        ? ` — an automatic guess from pincode ${profile.pin.pincode}, which can be kilometres off. Setting it yourself helps the right buyers find you.`
                        : ".")
                  : "We have not placed your kitchen on the map yet."}{" "}
                Press the button while standing in your kitchen — the pin lands wherever you are at
                that moment, and saves straight away. A pin far outside your registered pincode will
                not save.
              </p>
              <div className={styles.pinActions}>
                <Button variant="secondary" size="sm" onClick={handlePinKitchen} disabled={pinBusy}>
                  {pinBusy ? "Getting a fix…" : "Use my current location"}
                </Button>
                <span
                  className={pinError ? styles.statusError : styles.status}
                  role="status"
                  aria-live="polite"
                >
                  {pinError ?? pinStatus ?? ""}
                </span>
              </div>
            </div>
          </div>
        </FormSection>

        <FormSection
          id="links"
          title="Where else you are"
          description="Optional. Links show on your storefront so a buyer can see more of your work."
        >
          <FieldGrid>
            <Field label="Instagram" optional>
              <Input
                value={form.instagramUrl}
                inputMode="url"
                placeholder="https://instagram.com/…"
                onChange={(event) => set("instagramUrl", event.target.value)}
              />
            </Field>
            <Field label="Facebook" optional>
              <Input
                value={form.facebookUrl}
                inputMode="url"
                placeholder="https://facebook.com/…"
                onChange={(event) => set("facebookUrl", event.target.value)}
              />
            </Field>
            <Field label="YouTube" optional>
              <Input
                value={form.youtubeUrl}
                inputMode="url"
                placeholder="https://youtube.com/…"
                onChange={(event) => set("youtubeUrl", event.target.value)}
              />
            </Field>
            <Field label="Website" optional>
              <Input
                value={form.websiteUrl}
                inputMode="url"
                placeholder="https://…"
                onChange={(event) => set("websiteUrl", event.target.value)}
              />
            </Field>
          </FieldGrid>
        </FormSection>

        <SaveBar
          dirty={dirty}
          saving={saving}
          saved={saved}
          error={error}
          onSave={handleSave}
          onDiscard={handleDiscard}
          saveLabel="Save profile"
        />
      </FormPage>
    </div>
  );
}
