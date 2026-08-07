"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Chip } from "@/components/ui/Chip";
import { SearchField } from "@/components/ui/SearchField";
import { AdminPageHeader } from "./AdminPageHeader";
import { UserRow } from "./UserRow";
import { useAuth } from "@/lib/auth/AuthContext";
import { apiErrorMessage, getAllUsers, setUserSuspended } from "@/lib/api";
import type { User, UserRole } from "@/lib/types";
import styles from "./UsersClient.module.css";

const ROLE_FILTERS: { value: UserRole | "all"; label: string }[] = [
  { value: "all", label: "All roles" },
  { value: "consumer", label: "Consumer" },
  { value: "seller", label: "HomeKrafter" },
  { value: "admin", label: "Admin" },
];

const STATUS_FILTERS: { value: "all" | "active" | "suspended"; label: string }[] = [
  { value: "all", label: "All statuses" },
  { value: "active", label: "Active" },
  { value: "suspended", label: "Suspended" },
];

/**
 * `/admin/users` (M11a) — the full unscoped user directory
 * (`lib/api/admin.ts#getAllUsers`, every account across every role
 * surface), searchable by name/email/phone, filterable by role and
 * active/suspended status, with an inline suspend/reactivate action per
 * row that mutates the shared mock `users` array (see
 * `lib/data/admin.ts`'s doc comment on that array).
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

  if (!ready || (loading && users.length === 0 && !error)) {
    return <div className={styles.loading}>Loading users…</div>;
  }

  return (
    <div>
      <AdminPageHeader title="Users" subtitle={
          // "across every role" is a lie the moment a filter is on — and
          // the filters are the reason to read this line at all.
          roleFilter === "all" && statusFilter === "all" && !debouncedQuery
            ? `${total} account${total === 1 ? "" : "s"} across every role`
            : `${total} account${total === 1 ? "" : "s"} match these filters`
        } />
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}

      <div className={styles.filters}>
        <SearchField
          className={styles.search}
          placeholder="Search by name, email or phone…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <div className={styles.chipRow} role="tablist" aria-label="Filter by role">
          {ROLE_FILTERS.map((f) => (
            <Chip key={f.value} label={f.label} selected={roleFilter === f.value} onClick={() => {
                setRoleFilter(f.value);
                setPage(1);
              }} />
          ))}
        </div>
        <div className={styles.chipRow} role="tablist" aria-label="Filter by status">
          {STATUS_FILTERS.map((f) => (
            <Chip key={f.value} label={f.label} selected={statusFilter === f.value} onClick={() => {
                setStatusFilter(f.value);
                setPage(1);
              }} />
          ))}
        </div>
      </div>

      {users.length === 0 ? (
        <Card className={styles.empty}>No users match these filters.</Card>
      ) : (
        <>
          <div className={styles.list}>
            {users.map((u) => (
              <UserRow key={u.id} user={u} href={`/admin/users/${u.id}`} onToggleSuspend={handleToggleSuspend} />
            ))}
          </div>

          {lastPage > 1 && (
            <div className={styles.pager}>
              <Button
                variant="secondary"
                disabled={page <= 1 || loading}
                onClick={() => setPage((current) => Math.max(1, current - 1))}
              >
                Previous
              </Button>
              <span className={styles.pagerLabel} aria-live="polite">
                Page {page} of {lastPage}
              </span>
              <Button
                variant="secondary"
                disabled={page >= lastPage || loading}
                onClick={() => setPage((current) => current + 1)}
              >
                Next
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
