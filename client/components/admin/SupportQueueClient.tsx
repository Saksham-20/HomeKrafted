"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/feedback/EmptyState";
import { Field, TextArea } from "@/components/portal/Field";
import { LoadingRows } from "@/components/portal/LoadingRows";
import { Notice } from "@/components/portal/Notice";
import { Pager } from "@/components/portal/Pager";
import { SegmentedFilter } from "@/components/portal/SegmentedFilter";
import { Toolbar } from "@/components/portal/Toolbar";
import { StatCard } from "./StatCard";
import { AdminPageHeader } from "./AdminPageHeader";
import { StatusPill } from "./StatusPill";
import { useAuth } from "@/lib/auth/AuthContext";
import {
  apiErrorMessage,
  getAdminSupportTickets,
  replyToSupportTicket,
  setSupportTicketStatus,
  type AdminSupportQueue,
  type AdminSupportTicket,
} from "@/lib/api";
import { ApiError } from "@/lib/api/http";
import { formatDate } from "@/lib/format";
import type { SupportTicketStatus } from "@/lib/types";
import styles from "./SupportQueueClient.module.css";

type Filter = "all" | SupportTicketStatus;

const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "open", label: "Open" },
  { value: "in-progress", label: "In progress" },
  { value: "resolved", label: "Resolved" },
  { value: "closed", label: "Closed" },
];

/**
 * `/admin/support` (M15) — the dispute queue.
 *
 * `SupportTicket` and the customer `/support` form shipped in M7b/M8.3a;
 * nothing ever read them. A marketplace whose only remedy for a bad order
 * is a message no one receives has no dispute resolution at all — and
 * until M15 it was also the *only* remedy, since buyers had no cancel or
 * return path either.
 *
 * Two panes: the queue, and the selected thread. Sorted by most recent
 * activity, with "waiting on us" called out as its own number — status
 * labels drift, but "the customer wrote last" doesn't.
 */
export function SupportQueueClient() {
  const { ready, role } = useAuth();
  const [queue, setQueue] = useState<AdminSupportQueue | undefined>(undefined);
  const [filter, setFilter] = useState<Filter>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  // Bumped after a reply or a status change. The queue counts are the
  // server's answer over every ticket, so they cannot be re-derived from
  // the page in hand — and re-deriving them was how "Resolved" used to
  // make the header claim nobody was waiting.
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    if (!ready || role !== "admin") return;
    let cancelled = false;
    getAdminSupportTickets(filter === "all" ? undefined : filter, page)
      .then((data) => {
        if (!cancelled) {
          setQueue(data);
          setError(null);
        }
      })
      .catch((caught) => {
        if (!cancelled) {
          setError(apiErrorMessage(caught, "Couldn’t load the support queue. Try again."));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [ready, role, filter, page, reloadToken]);

  function applyUpdate(updated: AdminSupportTicket) {
    // Patch the row so the open conversation updates immediately, then
    // re-read for the authoritative counts and ordering.
    setQueue((current) =>
      current
        ? { ...current, items: current.items.map((row) => (row.id === updated.id ? updated : row)) }
        : current,
    );
    setReloadToken((n) => n + 1);
  }

  async function sendReply(ticket: AdminSupportTicket) {
    if (!reply.trim()) return;
    setBusy(true);
    setError(null);
    try {
      applyUpdate(await replyToSupportTicket(ticket.id, reply.trim()));
      setReply("");
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Couldn't send that reply.");
    } finally {
      setBusy(false);
    }
  }

  async function changeStatus(ticket: AdminSupportTicket, status: SupportTicketStatus) {
    setBusy(true);
    setError(null);
    try {
      applyUpdate(await setSupportTicketStatus(ticket.id, status));
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Couldn't update that ticket.");
    } finally {
      setBusy(false);
    }
  }

  if (!ready || !queue) {
    return (
      <div>
        <AdminPageHeader title="Support" />
        {error ? <Notice tone="danger">{error}</Notice> : <LoadingRows rows={5} />}
      </div>
    );
  }

  // Filtered by the server now — this is the page it sent back.
  const visible = queue.items;
  const lastPage = queue.pageSize > 0 ? Math.max(1, Math.ceil(queue.total / queue.pageSize)) : 1;
  const selected = queue.items.find((row) => row.id === selectedId) ?? null;

  return (
    <div>
      <AdminPageHeader
        title="Support"
        subtitle="Customer tickets and disputes. Replies post as Homekrafted and notify the customer."
      />

      <div className={styles.statGrid}>
        <StatCard
          label="Waiting on us"
          value={String(queue.summary.awaitingReply)}
          hint="Customer wrote last"
          warn={queue.summary.awaitingReply > 0}
        />
        <StatCard label="Open" value={String(queue.summary.open)} />
        <StatCard label="In progress" value={String(queue.summary.inProgress)} />
      </div>

      <Toolbar>
        <SegmentedFilter
          label="Filter by status"
          value={filter}
          onChange={(next) => {
            setFilter(next);
            setPage(1);
          }}
          options={FILTERS.map((f) =>
            f.value === "open"
              ? { ...f, count: queue.summary.open }
              : f.value === "in-progress"
                ? { ...f, count: queue.summary.inProgress }
                : f,
          )}
        />
      </Toolbar>

      <div className={styles.layout}>
        <div className={styles.list}>
          {visible.length === 0 ? (
            <EmptyState title="No tickets here." body="Try another status. A ticket lands here the moment a customer writes in from /support." />
          ) : (
            visible.map((ticket) => (
              <button
                key={ticket.id}
                type="button"
                className={styles.rowButton}
                onClick={() => setSelectedId(ticket.id)}
                aria-pressed={selectedId === ticket.id}
              >
                <Card
                  padding="sm"
                  className={selectedId === ticket.id ? styles.rowActive : styles.row}
                >
                  <div className={styles.rowHead}>
                    <span className={styles.subject}>{ticket.subject}</span>
                    <StatusPill status={ticket.status} />
                  </div>
                  <span className={styles.meta}>
                    {ticket.userName} · {ticket.channel} · {formatDate(ticket.lastMessageAt)}
                  </span>
                  {/* The one signal a status label can't carry. */}
                  {ticket.awaitingReply &&
                  (ticket.status === "open" || ticket.status === "in-progress") ? (
                    <span className={styles.waiting}>Waiting on us</span>
                  ) : null}
                </Card>
              </button>
            ))
          )}

          <Pager page={page} lastPage={lastPage} onChange={setPage} />
        </div>

        <div className={styles.thread}>
          {!selected ? (
            <Card padding="lg" className={styles.empty}>
              Pick a ticket to read it.
            </Card>
          ) : (
            <Card padding="md" className={styles.threadCard}>
              <div className={styles.threadHead}>
                <div>
                  <h2 className={styles.threadSubject}>{selected.subject}</h2>
                  <span className={styles.meta}>
                    {selected.userName}
                    {selected.userEmail ? ` · ${selected.userEmail}` : ""}
                    {selected.userPhone ? ` · ${selected.userPhone}` : ""}
                    {selected.orderRef ? ` · order ${selected.orderRef}` : ""}
                  </span>
                </div>
                <StatusPill status={selected.status} />
              </div>

              <div className={styles.messages}>
                {selected.messages.map((message) => (
                  <div
                    key={message.id}
                    className={message.sender === "agent" ? styles.agentMsg : styles.userMsg}
                  >
                    <span className={styles.msgSender}>
                      {message.sender === "agent" ? "Homekrafted" : selected.userName}
                    </span>
                    <p className={styles.msgBody}>{message.body}</p>
                    <span className={styles.msgTime}>{formatDate(message.createdAt)}</span>
                  </div>
                ))}
              </div>

              {error ? (
                <p className={styles.error} role="alert">
                  {error}
                </p>
              ) : null}

              <Field label="Reply" hint="Posts as Homekrafted and notifies the customer on the channels they allow.">
                <TextArea
                  value={reply}
                  rows={3}
                  autoGrow
                  maxLength={4000}
                  onChange={(event) => setReply(event.target.value)}
                  placeholder="Write back to the customer…"
                />
              </Field>

              <div className={styles.actions}>
                <Button size="sm" onClick={() => sendReply(selected)} disabled={busy || !reply.trim()}>
                  {busy ? "Sending…" : "Send reply"}
                </Button>
                {selected.status !== "resolved" && selected.status !== "closed" ? (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => changeStatus(selected, "resolved")}
                    disabled={busy}
                  >
                    Mark resolved
                  </Button>
                ) : (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => changeStatus(selected, "in-progress")}
                    disabled={busy}
                  >
                    Reopen
                  </Button>
                )}
                {selected.status !== "closed" ? (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => changeStatus(selected, "closed")}
                    disabled={busy}
                  >
                    Close
                  </Button>
                ) : null}
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
