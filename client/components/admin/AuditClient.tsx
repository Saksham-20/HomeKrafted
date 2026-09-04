"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/feedback/EmptyState";
import { Input, Select } from "@/components/portal/Field";
import { LoadingRows } from "@/components/portal/LoadingRows";
import { Notice } from "@/components/portal/Notice";
import { Pager } from "@/components/portal/Pager";
import { Toolbar } from "@/components/portal/Toolbar";
import { AdminPageHeader } from "./AdminPageHeader";
import { useAuth } from "@/lib/auth/AuthContext";
import { formatDate } from "@/lib/format";
import { getAdminAuditLog, type AdminAuditEntry, type AdminAuditPage } from "@/lib/api";
import styles from "./AuditClient.module.css";

const PAGE_SIZE = 50;

/**
 * `/admin/audit` — every admin mutation, newest first.
 *
 * The server has written these rows since M8 and audited every mutation
 * against them; until M27 there was no way to read one without a psql
 * prompt, while `docs/PRODUCTION-AUDIT.md` listed "audit log" as a
 * feature of the admin panel. This is that claim made true.
 *
 * Three rendering decisions worth keeping, each avoiding a maintenance
 * twin:
 *
 * - **`action` is shown verbatim** (`order.status_override`), in mono.
 *   Humanising it needs a label map covering ~25 slugs across
 *   `server/src/admin/**`, which silently misses every action added
 *   later. On a forensic screen the system's own vocabulary is the
 *   honest thing to show, and it is what you would grep for.
 * - **The entity filter's options come from the API**, not a hardcoded
 *   list of Prisma model names that goes stale the first time a new kind
 *   is logged.
 * - **`metadata` renders as a generic key/value grid.** Its shape differs
 *   per action — `before`/`after` on a verification change, `from`/`to`
 *   on an area assignment, flat keys elsewhere, absent entirely on some.
 *   Per-action renderers would cover two shapes and fall over on the
 *   rest. Values are stringified and rendered as **text, never HTML** —
 *   some of them contain operator-typed refusal reasons.
 */
export function AuditClient() {
  const { ready, role } = useAuth();
  const [data, setData] = useState<AdminAuditPage | undefined>(undefined);
  const [error, setError] = useState<string | undefined>(undefined);
  const [targetType, setTargetType] = useState("");
  const [actorId, setActorId] = useState("");
  const [page, setPage] = useState(1);

  useEffect(() => {
    if (!ready || role !== "admin") return;
    let cancelled = false;
    (async () => {
      try {
        const next = await getAdminAuditLog({
          targetType: targetType || undefined,
          actorId: actorId || undefined,
          page,
          pageSize: PAGE_SIZE,
        });
        if (cancelled) return;
        setData(next);
        setError(undefined);
      } catch {
        if (!cancelled) setError("Couldn't load the audit trail. Try again.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ready, role, targetType, actorId, page]);

  if (!ready || data === undefined) {
    return (
      <div>
        <AdminPageHeader title="Audit trail" subtitle="Every admin action, newest first." />
        {error ? <Notice tone="danger">{error}</Notice> : <LoadingRows rows={8} />}
      </div>
    );
  }

  const totalPages = Math.max(1, Math.ceil(data.total / data.pageSize));
  const filtered = Boolean(targetType || actorId);

  function clearFilters() {
    setTargetType("");
    setActorId("");
    setPage(1);
  }

  return (
    <div>
      <AdminPageHeader
        title="Audit trail"
        subtitle={`Every admin action, newest first. ${data.total} recorded.`}
      />

      <Toolbar
        search={
          <Input
            dense
            aria-label="Show only one admin's actions (paste their user id)"
            value={actorId}
            placeholder="Paste an admin's user id to see only their actions"
            onChange={(event) => {
              setActorId(event.target.value.trim());
              setPage(1);
            }}
          />
        }
        end={
          filtered ? (
            <Button variant="secondary" size="sm" onClick={clearFilters}>
              Clear filters
            </Button>
          ) : undefined
        }
      >
        <div className={styles.entitySelect}>
          <Select
            dense
            aria-label="Filter by entity"
            value={targetType}
            onChange={(event) => {
              setTargetType(event.target.value);
              setPage(1);
            }}
          >
            <option value="">All entities</option>
            {data.targetTypes.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </Select>
        </div>
      </Toolbar>

      {error && <Notice tone="danger">{error}</Notice>}

      {data.items.length === 0 ? (
        <EmptyState
          title={filtered ? "No admin actions match these filters." : "Nothing recorded yet."}
          body="Admin actions are recorded here as they happen — approvals, refunds, moderation decisions, status changes."
        />
      ) : (
        <div className={styles.list}>
          {data.items.map((entry) => (
            <AuditRow key={entry.id} entry={entry} />
          ))}
        </div>
      )}

      <Pager page={data.page} lastPage={totalPages} onChange={setPage} />
    </div>
  );
}

function AuditRow({ entry }: { entry: AdminAuditEntry }) {
  const metadata = Object.entries(entry.metadata ?? {});

  return (
    <Card padding="sm" className={styles.row}>
      <div className={styles.rowHead}>
        <code className={styles.action}>{entry.action}</code>
        <span className={styles.when}>{formatDate(entry.createdAt)}</span>
      </div>
      <span className={styles.actor}>
        {entry.actorName}
        {entry.actorEmail ? ` · ${entry.actorEmail}` : ""}
      </span>
      <span className={styles.target}>
        <code className={styles.targetType}>{entry.targetType}</code>
        {entry.targetId && <code className={styles.targetId}>{entry.targetId}</code>}
      </span>
      {metadata.length > 0 && (
        <dl className={styles.metadata}>
          {metadata.map(([key, value]) => (
            <div key={key} className={styles.metaPair}>
              <dt className={styles.metaKey}>{key}</dt>
              {/* Stringified and rendered as text. Some of these are
                  operator-typed refusal reasons, which are free text. */}
              <dd className={styles.metaValue}>{stringify(value)}</dd>
            </div>
          ))}
        </dl>
      )}
    </Card>
  );
}

function stringify(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}
