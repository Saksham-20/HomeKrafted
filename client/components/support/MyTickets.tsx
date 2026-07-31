"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Textarea";
import { useAuth } from "@/lib/auth/AuthContext";
import { addSupportMessage, getSupportTickets } from "@/lib/api";
import { ApiError } from "@/lib/api/http";
import { formatDate } from "@/lib/format";
import type { SupportTicket } from "@/lib/types";
import styles from "./MyTickets.module.css";

const STATUS_LABEL: Record<string, string> = {
  open: "Open",
  "in-progress": "We're on it",
  resolved: "Resolved",
  closed: "Closed",
};

/**
 * "Your tickets" (M15) — the customer half of the dispute loop.
 *
 * `GET /support/tickets` had shipped in M8.4a with **no call site
 * anywhere in the app**: someone could file a ticket and then never see
 * it again, and once M15 gave admins a queue to answer from, the reply
 * would have had nowhere to be read. There was also no way to write back.
 *
 * Signed-out visitors see nothing here rather than an error — `/support`
 * is deliberately reachable without an account (the call CTA and the
 * ticket form both work), so this section simply doesn't apply to them.
 */
export function MyTickets() {
  const { user, ready } = useAuth();
  const [tickets, setTickets] = useState<SupportTicket[] | undefined>(undefined);
  const [openId, setOpenId] = useState<string | null>(null);
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!ready || !user) return;
    let cancelled = false;
    getSupportTickets()
      .then((rows) => {
        if (!cancelled) setTickets(rows);
      })
      .catch(() => {
        if (!cancelled) setTickets([]);
      });
    return () => {
      cancelled = true;
    };
  }, [ready, user]);

  async function send(ticket: SupportTicket) {
    if (!reply.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const updated = await addSupportMessage(ticket.id, reply.trim());
      setTickets((current) =>
        current?.map((row) => (row.id === updated.id ? updated : row)),
      );
      setReply("");
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Couldn't send that.");
    } finally {
      setBusy(false);
    }
  }

  if (!ready || !user || tickets === undefined || tickets.length === 0) return null;

  return (
    <div className={styles.wrap}>
      <h2 className={styles.heading}>Your tickets</h2>
      <div className={styles.list}>
        {tickets.map((ticket) => {
          const isOpen = openId === ticket.id;
          const lastFromAgent = ticket.messages.at(-1)?.sender === "agent";
          return (
            <Card key={ticket.id} padding="md" className={styles.ticket}>
              <button
                type="button"
                className={styles.ticketHead}
                onClick={() => setOpenId(isOpen ? null : ticket.id)}
                aria-expanded={isOpen}
              >
                <span className={styles.ticketText}>
                  <span className={styles.subject}>{ticket.subject}</span>
                  <span className={styles.meta}>
                    {STATUS_LABEL[ticket.status] ?? ticket.status} · {formatDate(ticket.updatedAt)}
                    {ticket.orderRef ? ` · order ${ticket.orderRef}` : ""}
                  </span>
                </span>
                {/* The only thing worth a badge: we answered and they
                    haven't opened it. */}
                {lastFromAgent && !isOpen ? <span className={styles.newReply}>Reply</span> : null}
              </button>

              {isOpen ? (
                <div className={styles.thread}>
                  {ticket.messages.map((message) => (
                    <div
                      key={message.id}
                      className={message.sender === "agent" ? styles.agentMsg : styles.userMsg}
                    >
                      <span className={styles.msgSender}>
                        {message.sender === "agent" ? "Homekrafted" : "You"}
                      </span>
                      <p className={styles.msgBody}>{message.body}</p>
                      <span className={styles.msgTime}>{formatDate(message.createdAt)}</span>
                    </div>
                  ))}

                  {error ? (
                    <p className={styles.error} role="alert">
                      {error}
                    </p>
                  ) : null}

                  <Textarea
                    label="Write back"
                    value={reply}
                    rows={3}
                    maxLength={4000}
                    onChange={(event) => setReply(event.target.value)}
                    placeholder="Anything else we should know?"
                    hint={
                      ticket.status === "resolved"
                        ? "Replying reopens this ticket."
                        : undefined
                    }
                  />
                  <Button size="sm" onClick={() => send(ticket)} disabled={busy || !reply.trim()}>
                    {busy ? "Sending…" : "Send"}
                  </Button>
                </div>
              ) : null}
            </Card>
          );
        })}
      </div>
    </div>
  );
}
