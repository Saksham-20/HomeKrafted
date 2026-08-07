"use client";

import { useEffect, useMemo, useState } from "react";
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

  useEffect(() => {
    if (!ready || role !== "admin") return;
    let cancelled = false;
    (async () => {
      const list = await getAllUsers();
      if (cancelled) return;
      setUsers(list);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [ready, role]);

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

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return users.filter((u) => {
      if (roleFilter !== "all" && u.role !== roleFilter) return false;
      const suspended = u.suspended ?? false;
      if (statusFilter === "active" && suspended) return false;
      if (statusFilter === "suspended" && !suspended) return false;
      if (!q) return true;
      return (
        u.name.toLowerCase().includes(q) ||
        (u.email ?? "").toLowerCase().includes(q) ||
        (u.phone ?? "").toLowerCase().includes(q)
      );
    });
  }, [users, query, roleFilter, statusFilter]);

  if (!ready || loading) {
    return <div className={styles.loading}>Loading users…</div>;
  }

  return (
    <div>
      <AdminPageHeader title="Users" subtitle={`${users.length} account${users.length === 1 ? "" : "s"} across every role`} />
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
            <Chip key={f.value} label={f.label} selected={roleFilter === f.value} onClick={() => setRoleFilter(f.value)} />
          ))}
        </div>
        <div className={styles.chipRow} role="tablist" aria-label="Filter by status">
          {STATUS_FILTERS.map((f) => (
            <Chip key={f.value} label={f.label} selected={statusFilter === f.value} onClick={() => setStatusFilter(f.value)} />
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <Card className={styles.empty}>No users match these filters.</Card>
      ) : (
        <div className={styles.list}>
          {filtered.map((u) => (
            <UserRow key={u.id} user={u} href={`/admin/users/${u.id}`} onToggleSuspend={handleToggleSuspend} />
          ))}
        </div>
      )}
    </div>
  );
}
