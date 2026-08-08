"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Chip } from "@/components/ui/Chip";
import { AdminPageHeader } from "./AdminPageHeader";
import { StatusPill } from "./StatusPill";
import { getAdminCorporateInquiries, type AdminCorporateList } from "@/lib/api";
import { formatDate } from "@/lib/format";
import type { CorporateInquiryStatus } from "@/lib/types";
import styles from "./CorporateInquiriesClient.module.css";

const FILTERS: { value: CorporateInquiryStatus | "all"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "new", label: "New" },
  { value: "contacted", label: "Contacted" },
  { value: "quoted", label: "Quoted" },
  { value: "closed", label: "Closed" },
];

/**
 * `/admin/corporate` — the missing reader.
 *
 * `CorporateInquiry` has had a live public POST and a form behind it since
 * M7b, and nothing anywhere read a row. One Diwali corporate order is
 * ₹5k–₹50k against ₹120/day for a meal plan, so the leads sitting unread
 * were the most valuable thing being thrown away.
 */
export function CorporateInquiriesClient() {
  const [filter, setFilter] = useState<CorporateInquiryStatus | "all">("all");
  const [data, setData] = useState<AdminCorporateList | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | undefined>(undefined);
  const [page, setPage] = useState(1);

  useEffect(() => {
    // `setLoading(true)` belongs to the click that changes the filter, not
    // to this effect body — `react-hooks/set-state-in-effect`. Initial
    // state is already `true`, so the first render is covered.
    let cancelled = false;
    getAdminCorporateInquiries(filter === "all" ? undefined : filter, page)
      .then((res) => {
        if (!cancelled) setData(res);
      })
      .catch(() => {
        if (!cancelled) setError("Couldn't load the queue. Refresh to try again.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [filter, page]);

  // The summary above counts the whole queue, not this page — narrowed to
  // the loaded rows it read "0 unworked" the moment an admin filtered.
  const lastPage = data && data.pageSize > 0 ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <div>
      <AdminPageHeader
        title="Corporate &amp; bulk"
        subtitle={
          data
            ? `${data.summary.unworked} not yet worked · ${data.summary.contacted} contacted · ${data.summary.quoted} quoted`
            : "Bulk gifting enquiries"
        }
      />

      <div className={styles.filters}>
        {FILTERS.map((option) => (
          <Chip
            key={option.value}
            label={option.label}
            selected={filter === option.value}
            onClick={() => {
              setLoading(true);
              setFilter(option.value);
              setPage(1);
            }}
          />
        ))}
      </div>

      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}

      {loading ? (
        <div className={styles.loading}>Loading enquiries…</div>
      ) : !data || data.items.length === 0 ? (
        <Card className={styles.empty}>
          {/* Naming what triggers one, rather than "no items found" — an
              empty filter is not the same as an empty queue. */}
          {filter === "all"
            ? "No enquiries yet. One lands here whenever somebody submits the form on /corporate."
            : `Nothing at "${filter}". Try another filter — the queue may not be empty.`}
        </Card>
      ) : (
        <div className={styles.list}>
          {data.items.map((inquiry) => (
            <Card key={inquiry.id} padding="none" className={styles.row}>
              <div className={styles.body}>
                <Link href={`/admin/corporate/${inquiry.id}`} className={styles.company}>
                  {inquiry.companyName}
                </Link>
                <span className={styles.meta}>
                  {inquiry.contactName} · {inquiry.estimatedQuantity} units
                  {inquiry.occasion ? ` · ${inquiry.occasion}` : ""} ·{" "}
                  {formatDate(inquiry.createdAt)}
                </span>
                <span className={styles.contact}>
                  {inquiry.email} · {inquiry.phone}
                </span>
              </div>

              <div className={styles.pills}>
                <StatusPill
                  status={inquiry.orderType ?? "corporate"}
                  label={inquiry.orderType === "bulk" ? "Bulk" : "Corporate"}
                />
                <StatusPill status={inquiry.status} />
                {inquiry.quoteCount > 0 && (
                  <span className={styles.quoteCount}>
                    {inquiry.quoteCount} quote{inquiry.quoteCount === 1 ? "" : "s"}
                  </span>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      {lastPage > 1 && (
        <div className={styles.pager}>
          <Button
            variant="secondary"
            disabled={page <= 1}
            onClick={() => setPage((current) => Math.max(1, current - 1))}
          >
            Previous
          </Button>
          <span className={styles.pagerLabel} aria-live="polite">
            Page {page} of {lastPage}
          </span>
          <Button
            variant="secondary"
            disabled={page >= lastPage}
            onClick={() => setPage((current) => current + 1)}
          >
            Next
          </Button>
        </div>
      )}
    </div>
  );
}
