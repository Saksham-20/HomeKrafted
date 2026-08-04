"use client";

import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/Card";
import { Chip } from "@/components/ui/Chip";
import { AdminPageHeader } from "./AdminPageHeader";
import { SellerRow } from "./SellerRow";
import { ApplicationRow } from "./ApplicationRow";
import { useAuth } from "@/lib/auth/AuthContext";
import { ApiError } from "@/lib/api/http";
import {
  approveSellerApplication,
  getAllSellers,
  getPendingSellerApplications,
  rejectSellerApplication,
  setSellerStatus,
} from "@/lib/api";
import type { Seller, SellerApplication, SellerSpecialty } from "@/lib/types";
import styles from "./SellersClient.module.css";

type Tab = "sellers" | "queue";

/** Filters map to `SellerSpecialty`, which is a list per HomeKrafter — so these overlap by design. */
const TYPE_FILTERS: { value: SellerSpecialty | "all"; label: string }[] = [
  { value: "all", label: "All HomeKrafters" },
  { value: "homemade_food", label: "Homemade food" },
  { value: "bakery", label: "Bakery" },
  { value: "snacks", label: "Snacks" },
  { value: "laundry", label: "Laundry" },
];

/**
 * `/admin/sellers` (M11a) — two tabs sharing one screen: "All sellers"
 * (every `Seller`, unscoped, type-filterable, suspend/reactivate) and
 * "Approval queue" (pending `SellerApplication`s → approve/reject).
 * Approving here is the M7b `/sell` → M11a admin loop CLAUDE.md calls
 * out: `approveSellerApplication` mints a `Vendor` + an `approved`
 * `Seller`, which shows up in the "All sellers" tab immediately after
 * (both lists are refetched post-action rather than hand-patched
 * locally — the dataset is small enough that a refetch is simpler and
 * can't drift from `lib/api/admin.ts`'s actual mutation).
 */
export function SellersClient() {
  const { ready, role } = useAuth();
  const [tab, setTab] = useState<Tab>("sellers");
  const [sellers, setSellers] = useState<Seller[]>([]);
  const [applications, setApplications] = useState<SellerApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionError, setActionError] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<SellerSpecialty | "all">("all");

  async function refetch() {
    const [sellerList, pending] = await Promise.all([getAllSellers(), getPendingSellerApplications()]);
    setSellers(sellerList);
    setApplications(pending);
    setLoading(false);
  }

  useEffect(() => {
    if (!ready || role !== "admin") return;
    let cancelled = false;
    (async () => {
      const [sellerList, pending] = await Promise.all([getAllSellers(), getPendingSellerApplications()]);
      if (cancelled) return;
      setSellers(sellerList);
      setApplications(pending);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [ready, role]);

  /**
   * All three actions used to be a bare `await` + `refetch()` with no
   * `catch`. A rejected mutation threw an unhandled `ApiError`, the refetch
   * never ran, and the row simply didn't change — so a refusal looked
   * exactly like a success that hadn't rendered yet.
   *
   * That is survivable while every mutation succeeds. It stops being
   * survivable the moment the server starts refusing approvals on purpose
   * (an application whose area can't be resolved to a real place), because
   * the refusal is the whole point and the admin would never see it.
   */
  async function run(action: () => Promise<unknown>, fallback: string) {
    setActionError(null);
    try {
      await action();
      await refetch();
    } catch (err) {
      setActionError(err instanceof ApiError && err.message ? err.message : fallback);
    }
  }

  async function handleToggleSellerStatus(sellerId: string, nextStatus: "approved" | "suspended") {
    await run(
      () => setSellerStatus(sellerId, nextStatus),
      "Couldn't change that HomeKrafter's status. Try again.",
    );
  }

  async function handleApprove(applicationId: string) {
    await run(
      () => approveSellerApplication(applicationId),
      "Couldn't approve that application. Try again.",
    );
  }

  async function handleReject(applicationId: string) {
    await run(
      () => rejectSellerApplication(applicationId),
      "Couldn't reject that application. Try again.",
    );
  }

  const filteredSellers = useMemo(
    // `specialties` is a list, so a HomeKrafter who both cooks and does
    // laundry shows under either filter — matching how they actually work.
    () => (typeFilter === "all" ? sellers : sellers.filter((s) => s.specialties.includes(typeFilter))),
    [sellers, typeFilter],
  );

  if (!ready || loading) {
    return <div className={styles.loading}>Loading HomeKrafters…</div>;
  }

  return (
    <div>
      <AdminPageHeader
        title="HomeKrafters"
        subtitle={`${sellers.length} seller${sellers.length === 1 ? "" : "s"} · ${applications.length} pending application${applications.length === 1 ? "" : "s"}`}
      />

      <div className={styles.tabRow} role="tablist" aria-label="Sellers view">
        <Chip label="All HomeKrafters" selected={tab === "sellers"} onClick={() => setTab("sellers")} />
        <Chip label={`Approval queue (${applications.length})`} selected={tab === "queue"} onClick={() => setTab("queue")} />
      </div>

      <div aria-live="polite">
        {actionError && (
          <p className={styles.actionError} role="alert">
            {actionError}
          </p>
        )}
      </div>

      {tab === "sellers" ? (
        <>
          <div className={styles.chipRow} role="tablist" aria-label="Filter by type">
            {TYPE_FILTERS.map((f) => (
              <Chip key={f.value} label={f.label} selected={typeFilter === f.value} onClick={() => setTypeFilter(f.value)} />
            ))}
          </div>
          {filteredSellers.length === 0 ? (
            <Card className={styles.empty}>No HomeKrafters match this filter.</Card>
          ) : (
            <div className={styles.list}>
              {filteredSellers.map((seller) => (
                <SellerRow key={seller.id} seller={seller} onToggleStatus={handleToggleSellerStatus} />
              ))}
            </div>
          )}
        </>
      ) : applications.length === 0 ? (
        <Card className={styles.empty}>No pending applications — the queue is clear.</Card>
      ) : (
        <div className={styles.list}>
          {applications.map((application) => (
            <ApplicationRow
              key={application.id}
              application={application}
              onApprove={handleApprove}
              onReject={handleReject}
            />
          ))}
        </div>
      )}
    </div>
  );
}
