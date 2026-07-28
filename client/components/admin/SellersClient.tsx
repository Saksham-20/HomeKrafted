"use client";

import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/Card";
import { Chip } from "@/components/ui/Chip";
import { AdminPageHeader } from "./AdminPageHeader";
import { SellerRow } from "./SellerRow";
import { ApplicationRow } from "./ApplicationRow";
import { useAuth } from "@/lib/auth/AuthContext";
import {
  approveSellerApplication,
  getAllSellers,
  getPendingSellerApplications,
  rejectSellerApplication,
  setSellerStatus,
} from "@/lib/api";
import type { Seller, SellerApplication, SellerType } from "@/lib/types";
import styles from "./SellersClient.module.css";

type Tab = "sellers" | "queue";

const TYPE_FILTERS: { value: SellerType | "all"; label: string }[] = [
  { value: "all", label: "All types" },
  { value: "maker", label: "Makers" },
  { value: "laundry", label: "Laundry partners" },
  { value: "snack", label: "Snack HomeKrafters" },
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
  const [typeFilter, setTypeFilter] = useState<SellerType | "all">("all");

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

  async function handleToggleSellerStatus(sellerId: string, nextStatus: "approved" | "suspended") {
    await setSellerStatus(sellerId, nextStatus);
    await refetch();
  }

  async function handleApprove(applicationId: string) {
    await approveSellerApplication(applicationId);
    await refetch();
  }

  async function handleReject(applicationId: string) {
    await rejectSellerApplication(applicationId);
    await refetch();
  }

  const filteredSellers = useMemo(
    () => (typeFilter === "all" ? sellers : sellers.filter((s) => s.type === typeFilter)),
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
