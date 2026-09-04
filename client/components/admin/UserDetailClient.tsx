"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { NotFoundCard } from "@/components/feedback/NotFoundCard";
import { Button } from "@/components/ui/Button";
import { CheckRow, Fieldset, Switch } from "@/components/portal/Field";
import { FormPage } from "@/components/portal/FormPage";
import { FormSection } from "@/components/portal/FormSection";
import { LoadingRows } from "@/components/portal/LoadingRows";
import { Notice } from "@/components/portal/Notice";
import { SaveBar } from "@/components/portal/SaveBar";
import { AdminPageHeader } from "./AdminPageHeader";
import { StatusPill } from "./StatusPill";
import { useAuth } from "@/lib/auth/AuthContext";
import { apiErrorMessage, getUserById, setAdminAccess, setUserSuspended } from "@/lib/api";
import { isDirty } from "@/lib/portal/dirty";
import type { AdminScope } from "@/lib/types";
import { formatDate } from "@/lib/format";
import type { User } from "@/lib/types";
import styles from "./UserDetailClient.module.css";

/**
 * The sections, in the order they appear in the panel's own sidebar, so
 * ticking them reads as walking down the nav rather than a bag of words.
 */
const ADMIN_SCOPES: { value: AdminScope; label: string; help: string }[] = [
  { value: "analytics", label: "Dashboard & analytics", help: "The overview and the reports." },
  { value: "users", label: "Users & audit", help: "Every account, and the audit trail. This is the section that hands out sections — give it out last." },
  { value: "sellers", label: "HomeKrafters", help: "Approvals, verification and sign-in details." },
  { value: "orders", label: "Orders & corporate", help: "Order detail, status corrections, refunds, despatch and bulk enquiries." },
  { value: "catalog", label: "Catalog & collections", help: "The review queue, categories, occasions and gift guides." },
  { value: "finance", label: "Wallet & payouts", help: "Moves money." },
  { value: "support", label: "Support", help: "Customer tickets." },
  { value: "settings", label: "Settings", help: "Commission, delivery and meal lock time." },
];

interface AccessDraft {
  isAdmin: boolean;
  scopes: AdminScope[];
}

function toAccess(user: User | null | undefined): AccessDraft {
  return {
    isAdmin: user?.role === "admin",
    scopes: [...(user?.adminScopes ?? [])].sort(),
  };
}

export interface UserDetailClientProps {
  userId: string;
}

/** `/admin/users/[id]` (M11a) — one account's full detail + the suspend/reactivate action. */
export function UserDetailClient({ userId }: UserDetailClientProps) {
  const { ready, role } = useAuth();
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [suspending, setSuspending] = useState(false);

  // M47 — sub-admin access. Its own draft and its own save, because
  // granting somebody the payouts screen and suspending an account are
  // not the same decision and do not share an endpoint.
  const [access, setAccess] = useState<AccessDraft>({ isAdmin: false, scopes: [] });
  const [initialAccess, setInitialAccess] = useState<AccessDraft | undefined>(undefined);
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
      const draft = toAccess(found);
      setAccess(draft);
      setInitialAccess(draft);
    })();
    return () => {
      cancelled = true;
    };
  }, [ready, role, userId]);

  async function handleToggleSuspend() {
    if (!user || suspending) return;
    const nextSuspended = !(user.suspended ?? false);
    setError(null);
    setSuspending(true);
    try {
      const updated = await setUserSuspended(user.id, nextSuspended);
      if (updated) setUser({ ...updated });
    } catch (err) {
      setError(apiErrorMessage(err, "Couldn't change that account. Try again."));
    } finally {
      setSuspending(false);
    }
  }

  function patchAccess(patch: Partial<AccessDraft>) {
    setAccessSaved(false);
    setAccessError(null);
    setAccess((current) => ({ ...current, ...patch }));
  }

  function toggleScope(scope: AdminScope) {
    patchAccess({
      scopes: access.scopes.includes(scope)
        ? access.scopes.filter((s) => s !== scope)
        : [...access.scopes, scope].sort(),
    });
  }

  async function handleAccessSave() {
    if (!user) return;
    setAccessSaving(true);
    setAccessError(null);
    try {
      const updated = await setAdminAccess(user.id, { isAdmin: access.isAdmin, scopes: access.scopes });
      if (updated) {
        setUser({ ...updated });
        const draft = toAccess(updated);
        setAccess(draft);
        setInitialAccess(draft);
      } else {
        setInitialAccess(access);
      }
      setAccessSaved(true);
    } catch (err) {
      setAccessError(apiErrorMessage(err, "Couldn't change that account. Try again."));
    } finally {
      setAccessSaving(false);
    }
  }

  if (!ready || user === undefined) {
    return (
      <div>
        <AdminPageHeader title="Account" back={{ href: "/admin/users", label: "Users" }} />
        <LoadingRows rows={4} />
      </div>
    );
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
  const accessDirty = isDirty(initialAccess, access);

  return (
    <div>
      <AdminPageHeader
        back={{ href: "/admin/users", label: "Users" }}
        eyebrow="Account"
        title={user.name}
        subtitle={user.email ?? user.phone ?? user.id}
        actions={
          <>
            <Link href={`/admin/wallet/${user.id}`} className={styles.linkButton}>
              Open wallet
            </Link>
            <Button variant="secondary" onClick={handleToggleSuspend} disabled={suspending}>
              {suspending ? "Saving…" : suspended ? "Reactivate account" : "Suspend account"}
            </Button>
          </>
        }
      />

      <div className={styles.badges}>
        <StatusPill status={user.role} />
        <StatusPill status={suspended ? "suspended" : "active"} />
      </div>

      {error && <Notice tone="danger">{error}</Notice>}

      <FormPage
        sections={[
          { id: "account-details", label: "Account details" },
          { id: "account-access", label: "Admin access" },
        ]}
        navLabel="On this page"
      >
        <FormSection id="account-details" title="Account details">
          <div className={styles.grid}>
            <Fact label="Email" value={user.email ?? "—"} />
            <Fact label="Phone" value={user.phone ?? "—"} />
            <Fact label="Joined" value={formatDate(user.createdAt)} />
            <Fact label="Sign-in methods" value={user.authProviders.join(", ") || "—"} />
            <Fact label="Referral code" value={user.referralCode} />
            <Fact label="User ID" value={user.id} />
          </div>
          <p className={styles.footnote}>
            Suspending takes effect on their next request — they are signed out everywhere and every
            call is refused until reactivated.
          </p>
        </FormSection>

        {/*
          M47 — sub-admins. Sections rather than per-endpoint permissions,
          because a section is what an operator is actually handed ("you
          handle the review queue"). Thirty checkboxes read as more rigorous
          and end with everybody holding all thirty.
        */}
        <FormSection
          id="account-access"
          title="Admin access"
          description="A sub-admin sees only the sections you tick, and the server refuses the rest — hiding a link is not the gate."
          status={
            access.isAdmin
              ? { label: `${access.scopes.length} of ${ADMIN_SCOPES.length} sections`, tone: "neutral" }
              : undefined
          }
        >
          <Switch
            checked={access.isAdmin}
            onChange={(next) => patchAccess({ isAdmin: next, scopes: next ? access.scopes : [] })}
            label="This person is an admin"
            help="Turning it off removes every section at once."
          />

          {access.isAdmin && (
            <Fieldset
              legend="Sections they cover"
              hint="An admin with no sections is refused — tick at least one."
            >
              {ADMIN_SCOPES.map((scope) => (
                <CheckRow
                  key={scope.value}
                  label={scope.label}
                  help={scope.help}
                  checked={access.scopes.includes(scope.value)}
                  onChange={() => toggleScope(scope.value)}
                />
              ))}
            </Fieldset>
          )}
        </FormSection>

        <SaveBar
          dirty={accessDirty}
          saving={accessSaving}
          saved={accessSaved}
          error={accessError ?? undefined}
          onSave={handleAccessSave}
          onDiscard={() => {
            if (initialAccess) setAccess(initialAccess);
            setAccessError(null);
          }}
          saveLabel="Save admin access"
        />
      </FormPage>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className={styles.field}>
      <span className={styles.fieldLabel}>{label}</span>
      <span className={styles.fieldValue}>{value}</span>
    </div>
  );
}
