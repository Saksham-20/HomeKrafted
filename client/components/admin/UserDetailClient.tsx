"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { NotFoundCard } from "@/components/feedback/NotFoundCard";
import { Button } from "@/components/ui/Button";
import { StatusPill } from "./StatusPill";
import { useAuth } from "@/lib/auth/AuthContext";
import { apiErrorMessage, getUserById, setAdminAccess, setUserSuspended } from "@/lib/api";
import { Chip } from "@/components/ui/Chip";
import type { AdminScope } from "@/lib/types";
import { formatDate } from "@/lib/format";
import type { User } from "@/lib/types";
import styles from "./UserDetailClient.module.css";

/**
 * The sections, in the order they appear in the panel's own sidebar, so
 * ticking them reads as walking down the nav rather than a bag of words.
 */
const ADMIN_SCOPES: { value: AdminScope; label: string }[] = [
  { value: "analytics", label: "Dashboard & analytics" },
  { value: "users", label: "Users & audit" },
  { value: "sellers", label: "HomeKrafters" },
  { value: "orders", label: "Orders & corporate" },
  { value: "catalog", label: "Catalog & collections" },
  { value: "finance", label: "Wallet & payouts" },
  { value: "support", label: "Support" },
  { value: "settings", label: "Settings" },
];

export interface UserDetailClientProps {
  userId: string;
}

/** `/admin/users/[id]` (M11a) — one account's full detail + the suspend/reactivate action. */
export function UserDetailClient({ userId }: UserDetailClientProps) {
  const { ready, role } = useAuth();
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  // M47 — sub-admin access. Its own draft and its own save, because
  // granting somebody the payouts screen and suspending an account are
  // not the same decision and do not share an endpoint.
  const [isAdmin, setIsAdmin] = useState(false);
  const [scopes, setScopes] = useState<AdminScope[]>([]);
  const [accessSaving, setAccessSaving] = useState(false);
  const [accessSaved, setAccessSaved] = useState(false);
  const [accessError, setAccessError] = useState<string | null>(null);

  useEffect(() => {
    if (!ready || role !== "admin") return;
    let cancelled = false;
    (async () => {
      const found = await getUserById(userId);
      if (cancelled) return;
      setUser(found ?? null);
      setIsAdmin(found?.role === "admin");
      setScopes(found?.adminScopes ?? []);
    })();
    return () => {
      cancelled = true;
    };
  }, [ready, role, userId]);

  async function handleToggleSuspend() {
    if (!user) return;
    const nextSuspended = !(user.suspended ?? false);
    setError(null);
    try {
      const updated = await setUserSuspended(user.id, nextSuspended);
      if (updated) setUser({ ...updated });
    } catch (err) {
      setError(apiErrorMessage(err, "Couldn't change that account. Try again."));
    }
  }

  function toggleScope(scope: AdminScope) {
    setAccessSaved(false);
    setAccessError(null);
    setScopes((current) =>
      current.includes(scope) ? current.filter((s) => s !== scope) : [...current, scope],
    );
  }

  async function handleAccessSave() {
    if (!user) return;
    setAccessSaving(true);
    setAccessError(null);
    try {
      const updated = await setAdminAccess(user.id, { isAdmin, scopes });
      if (updated) {
        setUser({ ...updated });
        setScopes(updated.adminScopes ?? []);
        setIsAdmin(updated.role === "admin");
      }
      setAccessSaved(true);
    } catch (err) {
      setAccessError(apiErrorMessage(err, "Couldn't change that account. Try again."));
    } finally {
      setAccessSaving(false);
    }
  }

  if (!ready || user === undefined) {
    return <div className={styles.loading}>Loading user…</div>;
  }

  if (user === null) {
    return (
      <NotFoundCard
        title="We couldn’t find that account"
        body="No account matches this id. Search the users list by name, email or mobile number instead."
        backHref="/admin/users"
        backLabel="Back to users"
      />
    );
  }

  const suspended = user.suspended ?? false;

  return (
    <div>
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
      <Link href="/admin/users" className={styles.back}>
        <ChevronLeft size={15} strokeWidth={1.8} aria-hidden="true" />
        Back to users
      </Link>

      <div className={styles.header}>
        <span className={styles.avatar} aria-hidden="true">
          {user.name.charAt(0).toUpperCase()}
        </span>
        <div className={styles.headerBody}>
          <h1 className={styles.name}>{user.name}</h1>
          <div className={styles.badges}>
            <StatusPill status={user.role} />
            <StatusPill status={suspended ? "suspended" : "active"} />
          </div>
        </div>
        <div className={styles.headerActions}>
          <Button variant="secondary" onClick={handleToggleSuspend}>
            {suspended ? "Reactivate account" : "Suspend account"}
          </Button>
        </div>
      </div>

      <Card className={styles.card}>
        <span className={styles.cardTitle}>Account details</span>
        <div className={styles.grid}>
          <div className={styles.field}>
            <span className={styles.fieldLabel}>Email</span>
            <span className={styles.fieldValue}>{user.email ?? "—"}</span>
          </div>
          <div className={styles.field}>
            <span className={styles.fieldLabel}>Phone</span>
            <span className={styles.fieldValue}>{user.phone ?? "—"}</span>
          </div>
          <div className={styles.field}>
            <span className={styles.fieldLabel}>Joined</span>
            <span className={styles.fieldValue}>{formatDate(user.createdAt)}</span>
          </div>
          <div className={styles.field}>
            <span className={styles.fieldLabel}>Auth methods</span>
            <span className={styles.fieldValue}>{user.authProviders.join(", ")}</span>
          </div>
          <div className={styles.field}>
            <span className={styles.fieldLabel}>Referral code</span>
            <span className={styles.fieldValue}>{user.referralCode}</span>
          </div>
          <div className={styles.field}>
            <span className={styles.fieldLabel}>User ID</span>
            <span className={styles.fieldValue}>{user.id}</span>
          </div>
        </div>
      </Card>

      {/*
        M47 — sub-admins. Sections rather than per-endpoint permissions,
        because a section is what an operator is actually handed ("you
        handle the review queue"). Thirty checkboxes read as more rigorous
        and end with everybody holding all thirty.
      */}
      <Card className={styles.card}>
        <span className={styles.cardTitle}>Admin access</span>
        <p className={styles.accessLead}>
          A sub-admin sees only the sections you tick, and the server refuses the rest — hiding
          a link is not the gate.
        </p>

        <label className={styles.accessToggle}>
          <input
            type="checkbox"
            checked={isAdmin}
            onChange={(event) => {
              setIsAdmin(event.target.checked);
              setAccessSaved(false);
              setAccessError(null);
            }}
          />
          <span>This person is an admin</span>
        </label>

        {isAdmin && (
          <>
            <span className={styles.accessLabel}>Sections they cover</span>
            <div className={styles.accessChips}>
              {ADMIN_SCOPES.map((scope) => (
                <Chip
                  key={scope.value}
                  label={scope.label}
                  selected={scopes.includes(scope.value)}
                  onClick={() => toggleScope(scope.value)}
                />
              ))}
            </div>
            <p className={styles.accessHint}>
              <strong>Users</strong> is the section that hands out these sections — give it out
              last.
            </p>
          </>
        )}

        <div className={styles.accessActions}>
          <Button variant="primary" size="sm" onClick={handleAccessSave} disabled={accessSaving}>
            {accessSaving ? "Saving…" : "Save admin access"}
          </Button>
          {accessSaved && !accessError && <span className={styles.accessSaved}>Saved.</span>}
          {accessError && (
            <span className={styles.error} role="alert">
              {accessError}
            </span>
          )}
        </div>
      </Card>

      <p className={styles.footnote}>
        Suspension is a mock flag today — it doesn&rsquo;t yet block sign-in
        (no real session to gate). Wallet balance, orders and referral
        history land here in M11b.
      </p>
    </div>
  );
}
