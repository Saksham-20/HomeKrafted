"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { EmptyState } from "@/components/feedback/EmptyState";
import { Select } from "@/components/portal/Field";
import { LoadingRows } from "@/components/portal/LoadingRows";
import { Notice } from "@/components/portal/Notice";
import { Pager } from "@/components/portal/Pager";
import { SegmentedFilter } from "@/components/portal/SegmentedFilter";
import { Toolbar } from "@/components/portal/Toolbar";
import { AdminPageHeader } from "./AdminPageHeader";
import { SellerRow } from "./SellerRow";
import { ApplicationRow } from "./ApplicationRow";
import { useAuth } from "@/lib/auth/AuthContext";
import { ApiError } from "@/lib/api/http";
import { scrollBehavior } from "@/lib/motion";
import {
  approveSellerApplication,
  type ApprovedPlacement,
  assignApplicationArea,
  type InviteDeliveryReport,
  type TemporarySignInDetails,
  getAllSellers,
  getPendingSellerApplications,
  rejectSellerApplication,
  setSellerStatus,
} from "@/lib/api";
import type { Seller, SellerApplication, SellerSpecialty } from "@/lib/types";
import { SPECIALTY_GROUPS, SPECIALTY_LABELS } from "@/lib/types";
import styles from "./SellersClient.module.css";

type Tab = "sellers" | "queue";

type OnboardingFilter = "all" | "awaiting" | "onboarded" | "no_credentials";

/**
 * Approved is not the same as arrived (M32).
 *
 * An account exists from the moment an admin clicks approve, but until
 * somebody signs in and chooses a password, that kitchen is a row in a
 * table and nothing else. "Not signed in yet" is the list with work
 * attached — every one of them is a phone call somebody still owes.
 */
const ONBOARDING_FILTERS: { value: OnboardingFilter; label: string }[] = [
  { value: "all", label: "Everyone" },
  { value: "no_credentials", label: "No sign-in yet" },
  { value: "awaiting", label: "Details issued" },
  { value: "onboarded", label: "Signed in" },
];

/**
 * `/admin/sellers` (M11a) — two views sharing one screen: every
 * HomeKrafter (unscoped, filterable, suspend/reactivate) and the approval
 * queue (pending `SellerApplication`s → approve/reject). Approving here
 * is the `/sell` → admin loop CLAUDE.md calls out:
 * `approveSellerApplication` mints a `Vendor` + an `approved` `Seller`,
 * which shows up in the list immediately after (both lists are refetched
 * post-action rather than hand-patched locally — the dataset is small
 * enough that a refetch is simpler and can't drift from
 * `lib/api/admin.ts`'s actual mutation).
 *
 * The three chip rows this screen had stacked — view, onboarding, and a
 * sixteen-chip specialty wall — are one toolbar since 2026-09-04: the
 * view as a segmented control with counts, onboarding as a second, and
 * the specialty as a select (M22 gave the craft side filters; it did not
 * need each one to be a button).
 */
export function SellersClient() {
  const { ready, role } = useAuth();
  const [tab, setTab] = useState<Tab>("sellers");
  const [sellers, setSellers] = useState<Seller[]>([]);
  const [applications, setApplications] = useState<SellerApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionError, setActionError] = useState<string | null>(null);
  /**
   * True while any queue mutation is in flight.
   *
   * One flag for the whole queue rather than one per row: `run` refetches
   * the list on completion, so a second action started mid-flight would
   * be acting on rows that are about to be replaced.
   */
  const [actionBusy, setActionBusy] = useState(false);
  /**
   * Set when an approval succeeded but the new HomeKrafter could not be
   * reached on any channel. It is not an error — the account exists and
   * the storefront is live — but it is the one outcome an admin has to
   * act on, because that person cannot sign in until somebody hands them
   * the link. Before M21 this state was invisible: approval sent only an
   * in-app notification, to an inbox behind the login they could not pass.
   */
  const [inviteWarning, setInviteWarning] = useState<InviteDeliveryReport | null>(null);
  /** Sign-in details from the approval that just happened (M32). */
  const [approvedSignIn, setApprovedSignIn] = useState<TemporarySignInDetails | null>(null);
  /**
   * Set when the approval just planted a storefront on a pincode centroid
   * that may be well off (M36).
   *
   * Like `inviteWarning`, this is not an error — the kitchen exists and
   * is live — but it is something only this admin, right now, is
   * positioned to fix. `Vendor.lat`/`lng` decides which buyers can see
   * the storefront at all, and a 12 km error there is invisible on every
   * other screen: the storefront looks perfectly normal, it is simply
   * being shown to the wrong neighbourhood.
   */
  const [placementWarning, setPlacementWarning] = useState<
    (ApprovedPlacement & { sellerId: string }) | null
  >(null);
  const [typeFilter, setTypeFilter] = useState<SellerSpecialty | "all">("all");
  const [onboardingFilter, setOnboardingFilter] = useState<OnboardingFilter>("all");
  const [total, setTotal] = useState(0);
  const [pageSize, setPageSize] = useState(0);
  const [page, setPage] = useState(1);
  const [reloadToken, setReloadToken] = useState(0);

  /** Re-reads both lists after a mutation. */
  function refetch() {
    setReloadToken((n) => n + 1);
  }

  useEffect(() => {
    if (!ready || role !== "admin") return;
    let cancelled = false;
    (async () => {
      const [sellerPage, pending] = await Promise.all([
        getAllSellers({
          specialty: typeFilter === "all" ? undefined : typeFilter,
          onboarding: onboardingFilter === "all" ? undefined : onboardingFilter,
          page,
        }),
        getPendingSellerApplications(),
      ]);
      if (cancelled) return;
      setSellers(sellerPage.items);
      setTotal(sellerPage.total);
      setPageSize(sellerPage.pageSize);
      setApplications(pending);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [ready, role, typeFilter, onboardingFilter, page, reloadToken]);

  /**
   * The banner the outcome of every queue action lands in.
   *
   * It sits above a queue that runs well past one screen, so an admin
   * deciding the ninth application is nowhere near it. Until M36 that was
   * academic — `approveSellerApplication` swallowed its own errors, so
   * nothing was ever put in the banner to miss. Now that refusals arrive,
   * the banner is scrolled to: a message rendered 800px above the button
   * that caused it is the same as no message.
   */
  const noticeRef = useRef<HTMLDivElement>(null);

  function revealNotice() {
    noticeRef.current?.scrollIntoView({ block: "center", behavior: scrollBehavior() });
  }

  /**
   * All three actions used to be a bare `await` + `refetch()` with no
   * `catch`. A rejected mutation threw an unhandled `ApiError`, the refetch
   * never ran, and the row simply didn't change — so a refusal looked
   * exactly like a success that hadn't rendered yet.
   */
  async function run(action: () => Promise<unknown>, fallback: string) {
    // Refuse a second action while one is running. Approving a
    // HomeKrafter mints an account and fires an invite; doing it twice
    // because the first click looked like nothing happened is a real
    // outcome, not a theoretical one.
    if (actionBusy) return;
    setActionError(null);
    setActionBusy(true);
    try {
      await action();
      await refetch();
    } catch (err) {
      setActionError(err instanceof ApiError && err.message ? err.message : fallback);
      revealNotice();
    } finally {
      setActionBusy(false);
    }
  }

  async function handleToggleSellerStatus(sellerId: string, nextStatus: "approved" | "suspended") {
    await run(
      () => setSellerStatus(sellerId, nextStatus),
      "Couldn't change that HomeKrafter's status. Try again.",
    );
  }

  async function handleApprove(applicationId: string) {
    setInviteWarning(null);
    setApprovedSignIn(null);
    setPlacementWarning(null);
    let report: InviteDeliveryReport | undefined;
    let signIn: TemporarySignInDetails | undefined;
    let placement: (ApprovedPlacement & { sellerId: string }) | undefined;
    await run(async () => {
      const result = await approveSellerApplication(applicationId);
      report = result?.invite;
      signIn = result?.signIn;
      // Carried with the seller id so the warning can link straight at the
      // record that needs fixing. A warning that says "go and find them"
      // is a warning that gets dismissed.
      placement = result?.placement
        ? { ...result.placement, sellerId: result.seller.id }
        : undefined;
    }, "Couldn't approve that application. Try again.");
    if (placement) setPlacementWarning(placement);
    // The credentials, surfaced at the moment of approval rather than a
    // click away (M32) — this is when the admin is most likely to be
    // about to ring them. They also stay on the HomeKrafter's own row
    // until used, so closing this loses nothing.
    if (signIn) setApprovedSignIn(signIn);
    // Absent in mock mode, where nothing is sent — that is not a failure.
    if (report && !report.reached) setInviteWarning(report);
    // Both of those are things an admin has to read and act on — the
    // password to read down a phone, or the link nothing delivered — so
    // the same "don't render it off-screen" rule applies as to an error.
    if (signIn || (report && !report.reached) || placement) revealNotice();
  }

  async function handleReject(applicationId: string) {
    await run(
      () => rejectSellerApplication(applicationId),
      "Couldn't reject that application. Try again.",
    );
  }

  /**
   * Resolve a waitlisted application to a real serviced area, the way out
   * of the `'other'` waitlist. The server moves the row back to
   * `reviewing` and the refetch re-renders it approvable, so the admin's
   * next click is Approve on the same row.
   */
  async function handleAssignArea(applicationId: string, area: string) {
    if (!area) return;
    await run(
      () => assignApplicationArea(applicationId, area),
      "Couldn't assign that area. Try again.",
    );
  }

  const lastPage = pageSize > 0 ? Math.max(1, Math.ceil(total / pageSize)) : 1;

  if (!ready || loading) {
    return (
      <div>
        <AdminPageHeader title="HomeKrafters" />
        <LoadingRows rows={5} />
      </div>
    );
  }

  return (
    <div>
      <AdminPageHeader
        title="HomeKrafters"
        subtitle={`${total} HomeKrafter${total === 1 ? "" : "s"}${
          typeFilter === "all" ? "" : " with this specialty"
        } · ${applications.length} pending application${applications.length === 1 ? "" : "s"}`}
      />

      <div aria-live="polite" ref={noticeRef}>
        {actionError && <Notice tone="danger">{actionError}</Notice>}
        {approvedSignIn && (
          <Notice
            tone="success"
            title={`Approved. Here is how ${approvedSignIn.displayName} signs in.`}
            onDismiss={() => setApprovedSignIn(null)}
          >
            <p>
              Read these out now and note them down — the password is shown only this once. If
              it&apos;s lost, re-issue from their row; the old one stops working. Nothing else on the
              site works for them until they sign in and choose their own.
            </p>
            <p>
              <code>
                {approvedSignIn.email ?? approvedSignIn.phone} · {approvedSignIn.temporaryPassword}
              </code>
            </p>
          </Notice>
        )}
        {placementWarning && (
          <Notice
            tone="warning"
            title="Check where we put them on the map."
            onDismiss={() => setPlacementWarning(null)}
            actions={
              <Link className={styles.noticeLink} href={`/admin/sellers/${placementWarning.sellerId}`}>
                Open their record →
              </Link>
            }
          >
            <p>
              Pincode {placementWarning.pincode} ({placementWarning.label}) covers a wide area — its
              post offices are up to {Math.round(placementWarning.spreadKm)} km apart, so we may have
              placed this kitchen that far from where it really is. That decides which buyers can see
              them at all. They can fix it themselves — their profile asks them to pin the kitchen
              from where they stand, and it is listed as a gap until they do. If they do not sign
              in, open their record and set the exact spot.
            </p>
          </Notice>
        )}
        {inviteWarning && (
          <Notice
            tone="warning"
            title="Approved — but we could not reach them."
            onDismiss={() => setInviteWarning(null)}
          >
            <p>
              {inviteWarning.email.stubbed || inviteWarning.sms.stubbed
                ? "Email and SMS are not configured on this server, so nothing was sent."
                : "Every delivery attempt failed."}{" "}
              They cannot sign in until someone gives them this link. It works once and expires in
              7 days.
            </p>
            {inviteWarning.fallbackLink && (
              <p>
                <code>{inviteWarning.fallbackLink}</code>
              </p>
            )}
          </Notice>
        )}
      </div>

      <Toolbar>
        <SegmentedFilter
          label="View"
          value={tab}
          onChange={setTab}
          options={[
            { value: "sellers", label: "All HomeKrafters", count: total },
            { value: "queue", label: "Approval queue", count: applications.length },
          ]}
        />
        {tab === "sellers" && (
          <>
            {/* Onboarding first: "who have we approved but not actually
                got online" is the question with work attached, and it
                was unanswerable before M32. */}
            <SegmentedFilter
              label="Filter by onboarding"
              value={onboardingFilter}
              onChange={(next) => {
                setOnboardingFilter(next);
                setPage(1);
              }}
              options={ONBOARDING_FILTERS}
            />
            <div className={styles.specialtySelect}>
              <Select
                dense
                aria-label="Filter by what they make"
                value={typeFilter}
                onChange={(event) => {
                  setTypeFilter(event.target.value as SellerSpecialty | "all");
                  setPage(1);
                }}
              >
                <option value="all">Everything they make</option>
                {SPECIALTY_GROUPS.map((group) => (
                  <optgroup key={group.label} label={group.label}>
                    {group.values.map((value) => (
                      <option key={value} value={value}>
                        {SPECIALTY_LABELS[value]}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </Select>
            </div>
          </>
        )}
      </Toolbar>

      {tab === "sellers" ? (
        sellers.length === 0 ? (
          <EmptyState
            title="No HomeKrafters match this filter."
            body="Try another onboarding state or specialty — the list is not empty, this slice of it is."
          />
        ) : (
          <>
            <div className={styles.list}>
              {sellers.map((seller) => (
                <SellerRow key={seller.id} seller={seller} onToggleStatus={handleToggleSellerStatus} />
              ))}
            </div>
            <Pager page={page} lastPage={lastPage} onChange={setPage} />
          </>
        )
      ) : applications.length === 0 ? (
        <EmptyState
          title="The queue is clear."
          body="Nothing is waiting for a decision. New applications land here the moment somebody submits the form on /sell."
        />
      ) : (
        <div className={styles.list}>
          {applications.map((application) => (
            <ApplicationRow
              key={application.id}
              application={application}
              onApprove={handleApprove}
              onReject={handleReject}
              onAssignArea={handleAssignArea}
              busy={actionBusy}
            />
          ))}
        </div>
      )}
    </div>
  );
}
