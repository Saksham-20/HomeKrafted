"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { NotFoundCard } from "@/components/feedback/NotFoundCard";
import { Button } from "@/components/ui/Button";
import { StatusPill } from "./StatusPill";
import { useAuth } from "@/lib/auth/AuthContext";
import { apiErrorMessage, getUserById, setUserSuspended } from "@/lib/api";
import { formatDate } from "@/lib/format";
import type { User } from "@/lib/types";
import styles from "./UserDetailClient.module.css";

export interface UserDetailClientProps {
  userId: string;
}

/** `/admin/users/[id]` (M11a) — one account's full detail + the suspend/reactivate action. */
export function UserDetailClient({ userId }: UserDetailClientProps) {
  const { ready, role } = useAuth();
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!ready || role !== "admin") return;
    let cancelled = false;
    (async () => {
      const found = await getUserById(userId);
      if (cancelled) return;
      setUser(found ?? null);
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

      <p className={styles.footnote}>
        Suspension is a mock flag today — it doesn&rsquo;t yet block sign-in
        (no real session to gate). Wallet balance, orders and referral
        history land here in M11b.
      </p>
    </div>
  );
}
