"use client";

import { useEffect, useState } from "react";
import { SearchField } from "@/components/ui/SearchField";
import { EmptyState } from "@/components/feedback/EmptyState";
import { LoadingRows } from "@/components/portal/LoadingRows";
import { Notice } from "@/components/portal/Notice";
import { Pager } from "@/components/portal/Pager";
import { SegmentedFilter } from "@/components/portal/SegmentedFilter";
import { Toolbar } from "@/components/portal/Toolbar";
import { AdminPageHeader } from "./AdminPageHeader";
import { UserRow } from "./UserRow";
import { useAuth } from "@/lib/auth/AuthContext";
import { apiErrorMessage, getAllUsers, setUserSuspended } from "@/lib/api";
import type { User, UserRole } from "@/lib/types";
import styles from "./UsersClient.module.css";

const ROLE_FILTERS: { value: UserRole | "all"; label: string }[] = [
  { value: "all", label: "All roles" },
  { value: "consumer", label: "Shoppers" },
  { value: "seller", label: "HomeKrafters" },
  { value: "admin", label: "Admins" },
];

const STATUS_FILTERS: { value: "all" | "active" | "suspended"; label: string }[] = [
  { value: "all", label: "Any status" },
  { value: "active", label: "Active" },
  { value: "suspended", label: "Suspended" },
];

/**
 * `/admin/users` (M11a) — the full unscoped user directory
 * (`lib/api/admin.ts#getAllUsers`, every account across every role
 * surface), searchable by name/email/phone, filterable by role and
 * active/suspended status, with an inline suspend/reactivate action per
 * row.
 */
export function UsersClient() {
  const { ready, role } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<UserRole | "all">("all");
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "suspended">("all");
  const [total, setTotal] = useState(0);
  const [pageSize, setPageSize] = useState(0);
  const [page, setPage] = useState(1);
  // What the request is actually made with. Without settling first,
  // searching is one network call per keystroke.
  const [debouncedQuery, setDebouncedQuery] = useState("");

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedQuery(query.trim());
      // A new search restarts at page one — page 4 of a two-row result
      // renders empty and reads as "no users".
      setPage(1);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    if (!ready || role !== "admin") return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const result = await getAllUsers({
          role: roleFilter === "all" ? undefined : roleFilter,
          status: statusFilter === "all" ? undefined : statusFilter,
          q: debouncedQuery || undefined,
          page,
        });
        if (cancelled) return;
        setUsers(result.items);
        setTotal(result.total);
        setPageSize(result.pageSize);
        setError(null);
      } catch (err) {
        if (cancelled) return;
        setError(apiErrorMessage(err, "Couldn’t load accounts. Try again."));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ready, role, roleFilter, statusFilter, debouncedQuery, page]);

  async function handleToggleSuspend(userId: string, suspended: boolean) {
    setError(null);
    try {
      const updated = await setUserSuspended(userId, suspended);
      if (!updated) return;
      setUsers((current) => current.map((u) => (u.id === userId ? { ...u, suspended } : u)));
    } catch (err) {
      // Suspension takes effect on the very next request (M21). An admin
      // who thinks they have locked an account and has not is the wrong
      // person to leave uninformed.
      setError(apiErrorMessage(err, "Couldn't change that account. Try again."));
    }
  }

  const lastPage = pageSize > 0 ? Math.max(1, Math.ceil(total / pageSize)) : 1;
  const initialLoad = !ready || (loading && users.length === 0 && !error);

  return (
    <div>
      <AdminPageHeader
        title="Users"
        subtitle={
          initialLoad
            ? undefined
            : // "across every role" is a lie the moment a filter is on — and
              // the filters are the reason to read this line at all.
              roleFilter === "all" && statusFilter === "all" && !debouncedQuery
              ? `${total} account${total === 1 ? "" : "s"} across every role`
              : `${total} account${total === 1 ? "" : "s"} match these filters`
        }
      />
      {error && <Notice tone="danger">{error}</Notice>}

      <Toolbar
        search={
          <SearchField
            placeholder="Search by name, email or phone…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            aria-label="Search accounts"
          />
        }
      >
        <SegmentedFilter
          label="Filter by role"
          value={roleFilter}
          onChange={(next) => {
            setRoleFilter(next);
            setPage(1);
          }}
          options={ROLE_FILTERS}
        />
        <SegmentedFilter
          label="Filter by status"
          value={statusFilter}
          onChange={(next) => {
            setStatusFilter(next);
            setPage(1);
          }}
          options={STATUS_FILTERS}
        />
      </Toolbar>

      {initialLoad ? (
        <LoadingRows rows={6} />
      ) : users.length === 0 ? (
        <EmptyState title="No accounts match these filters." body="Try another role or status, or clear the search." />
      ) : (
        <>
          <div className={styles.list}>
            {users.map((u) => (
              <UserRow key={u.id} user={u} href={`/admin/users/${u.id}`} onToggleSuspend={handleToggleSuspend} />
            ))}
          </div>
          <Pager page={page} lastPage={lastPage} onChange={setPage} disabled={loading} />
        </>
      )}
    </div>
  );
}
