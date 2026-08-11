"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { BadgeCheck, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { CapacityMeter } from "@/components/ui/CapacityMeter";
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
  type SellerProfileInput,
} from "@/lib/api";
import { formatDate } from "@/lib/format";
import type { OwnVendorProfile, VendorBlackout, VendorPhoto } from "@/lib/types";
import { makesFood } from "@/lib/types";
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
  const { ready, seller, sellerDataReady } = useAuth();
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
   */
  const sellsFood = makesFood(seller?.specialties ?? []);

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
