"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { NotFoundCard } from "@/components/feedback/NotFoundCard";
import { StatusPill } from "./StatusPill";
import { SellerSignInDetails } from "./SellerSignInDetails";
import { SellerVerificationPanel } from "./SellerVerificationPanel";
import { useAuth } from "@/lib/auth/AuthContext";
import { apiErrorMessage, getAdminSellerDetail, setSellerStatus } from "@/lib/api";
import { formatCurrency, formatDate } from "@/lib/format";
import { kitchenLoading } from "@/lib/kitchen-copy";
import { SPECIALTY_LABELS, type AdminSellerDetail } from "@/lib/types";
import styles from "./SellerDetailClient.module.css";

export interface SellerDetailClientProps {
  sellerId: string;
}

/**
 * `/admin/sellers/[id]` (M32) — one HomeKrafter, whole.
 *
 * The list row carries a name, a status and three buttons; everything an
 * admin needs in order to *decide* something about a kitchen — how to
 * reach them, where they sell from, what they have listed, what they have
 * sold, what they were approved on — was spread across five screens or
 * was not anywhere. This is the page a name links to.
 *
 * Money on this page is the kitchen's **line-item share**, never the
 * order total: an order can span several kitchens, and crediting each
 * with the whole thing overstates what a home cook earned and disagrees
 * with what they are paid.
 */
export function SellerDetailClient({ sellerId }: SellerDetailClientProps) {
  const { ready, role } = useAuth();
  const [detail, setDetail] = useState<AdminSellerDetail | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // A token rather than a callable `load()`: an action re-reads the whole
  // record by bumping it, which keeps the only setState inside the
  // effect's async body (calling it synchronously from an effect is a
  // cascading render, and the lint rule that says so is right).
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    if (!ready || role !== "admin") return;
    let cancelled = false;
    (async () => {
      try {
        const next = await getAdminSellerDetail(sellerId);
        if (!cancelled) setDetail(next);
      } catch {
        if (!cancelled) setDetail(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ready, role, sellerId, reloadToken]);

  async function toggleStatus() {
    if (!detail || busy) return;
    const next = detail.seller.status === "suspended" ? "approved" : "suspended";
    setBusy(true);
    setError(null);
    try {
      await setSellerStatus(detail.seller.id, next);
      setReloadToken((n) => n + 1);
    } catch (err) {
      setError(apiErrorMessage(err, "Couldn't change that HomeKrafter's status. Try again."));
    } finally {
      setBusy(false);
    }
  }

  if (!ready || detail === undefined) {
    return <div className={styles.loading}>{kitchenLoading("admin-seller-detail")}</div>;
  }

  if (detail === null) {
    return (
      <NotFoundCard
        title="We couldn’t find that HomeKrafter"
        body="No HomeKrafter matches this id. They may have been removed, or the link is out of date."
        backHref="/admin/sellers"
        backLabel="Back to HomeKrafters"
      />
    );
  }

  const { seller, vendor, contact, signIn, activity, application } = detail;
  const suspended = seller.status === "suspended";
  // Same three-way split the list uses: `awaiting` (details issued,
  // unused) and `no_credentials` (none exist) are both "has not arrived",
  // and only they may see a password.
  const pending = signIn.status === "awaiting" || signIn.status === "no_credentials";

  return (
    <div>
      <Link href="/admin/sellers" className={styles.back}>
        <ChevronLeft size={15} strokeWidth={1.8} aria-hidden="true" />
        Back to HomeKrafters
      </Link>

      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}

      <div className={styles.header}>
        <div className={styles.headerBody}>
          <h1 className={styles.name}>{seller.displayName}</h1>
          <span className={styles.sub}>
            {seller.specialties.map((s) => SPECIALTY_LABELS[s]).join(" · ") || "HomeKrafter"} ·
            Since {formatDate(seller.createdAt)}
          </span>
          <div className={styles.badges}>
            <StatusPill status={seller.status} />
            {signIn.status === "no_credentials" && (
              <span className={styles.warnPill}>No sign-in yet</span>
            )}
            {signIn.status === "awaiting" && (
              <span className={styles.warnPill}>Not signed in yet</span>
            )}
          </div>
        </div>
        <div className={styles.headerActions}>
          {/* Their public page, as a buyer sees it — the fastest check on
              whether a kitchen has actually got going. A link, not a
              button: it opens a page, and open-in-new-tab is exactly what
              somebody comparing two screens wants. */}
          <Link href={`/storefront/${vendor.slug}`} className={styles.linkButton}>
            View storefront
          </Link>
          <Button variant="secondary" onClick={toggleStatus} disabled={busy}>
            {suspended ? "Reactivate" : "Suspend"}
          </Button>
        </div>
      </div>

      <Card className={styles.card}>
        <span className={styles.cardTitle}>Contact</span>
        <div className={styles.grid}>
          <Field label="Contact name" value={contact.name} />
          <Field
            label="Email"
            value={contact.email ?? "—"}
            note={contact.email ? (contact.emailVerified ? "verified" : "unverified") : undefined}
          />
          <Field
            label="Phone"
            value={contact.phone ?? "—"}
            note={contact.phone ? (contact.phoneVerified ? "verified" : "unverified") : undefined}
          />
          <Field label="Sign-in methods" value={contact.authProviders.join(", ") || "—"} />
          <Field label="Account created" value={formatDate(contact.accountCreatedAt)} />
          <Field label="HomeKrafter ID" value={seller.id} mono />
        </div>
      </Card>

      {/* Only while they have not arrived — once a kitchen chooses its own
          password there is no path here that mints one, same rule as the
          list row. */}
      {pending && !suspended && (
        <Card className={styles.card}>
          <span className={styles.cardTitle}>Sign-in details</span>
          <SellerSignInDetails sellerId={seller.id} signIn={signIn} />
        </Card>
      )}

      <Card className={styles.card}>
        <span className={styles.cardTitle}>Storefront</span>
        <div className={styles.grid}>
          <Field label="Storefront name" value={vendor.name} />
          <Field label="Where they work from" value={vendor.location} />
          <Field
            label="Delivers within"
            value={vendor.deliveryRadiusKm ? `${vendor.deliveryRadiusKm} km` : "Platform default"}
          />
          <Field
            label="Rating"
            value={
              vendor.rating ? `★ ${vendor.rating.toFixed(1)} (${vendor.reviewCount ?? 0})` : "Unrated"
            }
          />
          <Field label="Followers" value={String(vendor.followerCount)} />
          <Field label="Reviews" value={String(activity.reviewCount)} />
        </div>
        {vendor.bio && <p className={styles.bio}>{vendor.bio}</p>}
      </Card>

      <Card className={styles.card}>
        <span className={styles.cardTitle}>Activity</span>
        <div className={styles.grid}>
          <Field
            label="Listings"
            value={`${activity.listings.available} on / ${activity.listings.total}`}
            note={
              activity.listings.awaitingReview
                ? `${activity.listings.awaitingReview} awaiting review`
                : undefined
            }
          />
          <Field label="Snacks" value={String(activity.snacks)} />
          <Field label="Meal plans" value={String(activity.mealPlans)} />
          <Field label="Orders" value={String(activity.orderCount)} />
          <Field label="Units sold" value={String(activity.unitsSold)} />
          <Field label="Their share of sales" value={formatCurrency(activity.revenue)} />
          <Field
            label="Snack orders"
            value={`${activity.snackOrderCount} · ${formatCurrency(activity.snackRevenue)}`}
          />
          <Field
            label="Payouts waiting"
            value={
              activity.pendingPayoutCount
                ? `${activity.pendingPayoutCount} · ${formatCurrency(activity.pendingPayoutAmount)}`
                : "None"
            }
          />
          <Field
            label="Last order"
            value={activity.lastOrderAt ? formatDate(activity.lastOrderAt) : "Never"}
          />
        </div>
        <p className={styles.footnote}>
          Sales are this kitchen&rsquo;s line-item share, not the order total — an order can span
          several kitchens.
        </p>
      </Card>

      <Card className={styles.card}>
        <span className={styles.cardTitle}>Verification</span>
        <SellerVerificationPanel sellerId={seller.id} />
      </Card>

      {application ? (
        <Card className={styles.card}>
          <span className={styles.cardTitle}>What they applied with</span>
          <div className={styles.grid}>
            <Field label="Business name" value={application.businessName} />
            <Field label="Contact" value={application.contactName} />
            <Field label="City" value={application.city} />
            {/* Pincode since M36; the older two survive for rows filed
                before it, where they are all there is. */}
            <Field
              label={application.pincode ? "Pincode" : "Area"}
              value={application.pincode ?? application.areaLabel ?? application.area ?? "—"}
            />
            <Field label="Applied" value={formatDate(application.createdAt)} />
            <Field label="Status" value={application.status} />
            {/* M32 — absent on anything filed before the form asked. */}
            {application.yearsMaking !== undefined && (
              <Field label="Years making" value={String(application.yearsMaking)} />
            )}
            {application.capacityPerDay !== undefined && (
              <Field label="Orders a day" value={String(application.capacityPerDay)} />
            )}
            {application.fssaiNumber && (
              <Field label="FSSAI (unverified)" value={application.fssaiNumber} mono />
            )}
            {application.instagramUrl && (
              <Field label="Instagram" value={application.instagramUrl} />
            )}
            {application.websiteUrl && <Field label="Website" value={application.websiteUrl} />}
          </div>
          {/* Free text from a public form: rendered as text, never markup. */}
          <p className={styles.bio}>{application.description}</p>
        </Card>
      ) : (
        <Card className={styles.card}>
          <span className={styles.cardTitle}>What they applied with</span>
          <p className={styles.footnote}>
            No application on file for this email. Either they were set up by hand, or the address on
            the account has changed since they applied.
          </p>
        </Card>
      )}
    </div>
  );
}

function Field({
  label,
  value,
  note,
  mono,
}: {
  label: string;
  value: string;
  note?: string;
  mono?: boolean;
}) {
  return (
    <div className={styles.field}>
      <span className={styles.fieldLabel}>{label}</span>
      <span className={mono ? styles.fieldValueMono : styles.fieldValue}>{value}</span>
      {note && <span className={styles.fieldNote}>{note}</span>}
    </div>
  );
}
