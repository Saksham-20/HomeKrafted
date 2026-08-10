"use client";

import { useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { Headset, Phone, Send } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { Textarea } from "@/components/ui/Textarea";
import { apiErrorMessage, createSupportTicket, type CreateSupportTicketInput } from "@/lib/api";
import { getAutoReply } from "@/lib/support/autoReply";
import { MyTickets } from "./MyTickets";
import type { SupportChannel, SupportTicket } from "@/lib/types";
import styles from "./SupportClient.module.css";

export interface SupportClientProps {
  phone: { display: string; tel: string; hours: string };
  chatGreeting: string;
}

interface ChatMessage {
  id: string;
  sender: "user" | "agent";
  body: string;
  createdAt: string;
}

const CHANNEL_OPTIONS: { value: SupportChannel; label: string }[] = [
  { value: "email", label: "Email" },
  { value: "chat", label: "Chat" },
  { value: "call", label: "Call" },
];

/**
 * Support (M7b) — a mock chat widget (local message thread + canned
 * auto-reply via `lib/support/autoReply.ts`, no backend), a `tel:` call
 * CTA, and a ticket form (`createSupportTicket`, mock submit →
 * confirmation). Standalone route (not wrapped in `AccountShell`) since
 * support should be reachable whether or not the shopper is signed in.
 */
export function SupportClient({ phone, chatGreeting }: SupportClientProps) {
  return (
    <section className={clsx("container", styles.page)}>
      <div className={styles.header}>
        <span className={styles.eyebrow}>Support</span>
        <h1 className={styles.title}>We&rsquo;re here to help</h1>
        <p className={styles.subtitle}>
          Chat with us, call the team, or raise a ticket — whichever&rsquo;s easiest.
        </p>
      </div>

      <CallCard phone={phone} />

      <div className={styles.layout}>
        <ChatWidget greeting={chatGreeting} />
        <TicketForm />
      </div>

      {/* M15 — before this, `getSupportTickets` had no call site anywhere:
          you could file a ticket and never see it again, and an agent's
          reply had nowhere to be read. Renders nothing when signed out or
          when there are no tickets. */}
      <MyTickets />
    </section>
  );
}

function CallCard({ phone }: { phone: SupportClientProps["phone"] }) {
  return (
    <Card className={styles.callCard}>
      <span className={styles.callIcon} aria-hidden="true">
        <Phone size={20} strokeWidth={1.7} />
      </span>
      <div className={styles.callBody}>
        <div className={styles.callTitle}>Call us</div>
        <div className={styles.callHint}>{phone.hours}</div>
      </div>
      <a href={`tel:${phone.tel}`} className={styles.callButton}>
        {phone.display}
      </a>
    </Card>
  );
}

function ChatWidget({ greeting }: { greeting: string }) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    { id: "greet", sender: "agent", body: greeting, createdAt: new Date().toISOString() },
  ]);
  const [input, setInput] = useState("");
  const [typing, setTyping] = useState(false);
  const threadRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, typing]);

  function handleSend() {
    const body = input.trim();
    if (!body) return;

    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      sender: "user",
      body,
      createdAt: new Date().toISOString(),
    };
    setMessages((current) => [...current, userMessage]);
    setInput("");
    setTyping(true);

    window.setTimeout(() => {
      setMessages((current) => [
        ...current,
        {
          id: `agent-${Date.now()}`,
          sender: "agent",
          body: getAutoReply(body),
          createdAt: new Date().toISOString(),
        },
      ]);
      setTyping(false);
    }, 700);
  }

  return (
    <Card className={styles.chatCard}>
      <div className={styles.chatHeader}>
        <Headset size={18} strokeWidth={1.7} aria-hidden="true" />
        <span>Chat with us</span>
      </div>

      <div className={styles.chatThread} ref={threadRef}>
        {messages.map((message) => (
          <div
            key={message.id}
            className={clsx(styles.bubble, message.sender === "user" ? styles.bubbleUser : styles.bubbleAgent)}
          >
            {message.body}
          </div>
        ))}
        {typing && <div className={clsx(styles.bubble, styles.bubbleAgent, styles.typing)}>Typing…</div>}
      </div>

      <div className={styles.chatInputRow}>
        <input
          type="text"
          className={styles.chatInput}
          /* A placeholder is not a label: it disappears the moment
             somebody types, and a screen reader reaches this as an
             unnamed text field. */
          aria-label="Type a message to support"
          placeholder="Type a message…"
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              handleSend();
            }
          }}
        />
        <Button variant="icon" aria-label="Send message" onClick={handleSend} disabled={!input.trim()}>
          <Send size={16} strokeWidth={1.8} />
        </Button>
      </div>
    </Card>
  );
}

const EMPTY_TICKET_FORM = { subject: "", orderRef: "", message: "" };

function TicketForm() {
  const [channel, setChannel] = useState<SupportChannel>("email");
  const [form, setForm] = useState(EMPTY_TICKET_FORM);
  const [busy, setBusy] = useState(false);
  const [ticket, setTicket] = useState<SupportTicket | null>(null);
  const [error, setError] = useState<string | null>(null);

  const valid = form.subject.trim().length > 0 && form.message.trim().length > 0;

  function set<K extends keyof typeof EMPTY_TICKET_FORM>(key: K, value: string) {
    setForm((current) => ({ ...current, [key]: value }));
    setError(null);
  }

  async function handleSubmit() {
    if (!valid || busy) return;
    setBusy(true);
    setError(null);
    try {
      const input: CreateSupportTicketInput = {
        subject: form.subject.trim(),
        channel,
        message: form.message.trim(),
        orderRef: form.orderRef.trim() || undefined,
      };
      const created = await createSupportTicket(input);
      setTicket(created);
    } catch (err) {
      // Somebody has just typed out a problem they are having. Losing that
      // silently — which is what no `catch` here meant — is the worst
      // possible moment for the app to say nothing.
      setError(apiErrorMessage(err, "Couldn't send your message. Try again."));
    } finally {
      setBusy(false);
    }
  }

  if (ticket) {
    return (
      <Card className={styles.ticketCard}>
        <div className={styles.confirmation}>
          <span className={styles.confirmationBadge}>Ticket raised</span>
          <p className={styles.confirmationTitle}>Ticket #{ticket.id.replace("sup-", "")} created</p>
          <p className={styles.confirmationCopy}>
            We&rsquo;ll follow up over {ticket.channel === "call" ? "a call" : ticket.channel} shortly.
            Status: <b>{ticket.status}</b>.
          </p>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              setTicket(null);
              setForm(EMPTY_TICKET_FORM);
            }}
          >
            Raise another ticket
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <Card className={styles.ticketCard}>
      <span className={styles.ticketTitle}>Raise a ticket</span>
      <label className={styles.field}>
        <span className={styles.fieldLabel}>Subject</span>
        <input
          className={styles.input}
          placeholder="What's this about?"
          value={form.subject}
          onChange={(event) => set("subject", event.target.value)}
        />
      </label>
      <label className={styles.field}>
        <span className={styles.fieldLabel}>Order or booking number (optional)</span>
        <input
          className={styles.input}
          placeholder="e.g. HK2043"
          value={form.orderRef}
          onChange={(event) => set("orderRef", event.target.value)}
        />
      </label>
      <div className={styles.field}>
        <span className={styles.fieldLabel}>Preferred follow-up</span>
        <div className={styles.channelChips}>
          {CHANNEL_OPTIONS.map((option) => (
            <Chip
              key={option.value}
              label={option.label}
              selected={channel === option.value}
              onClick={() => setChannel(option.value)}
            />
          ))}
        </div>
      </div>
      <Textarea
        label="Message"
        rows={4}
        placeholder="Tell us what's going on…"
        value={form.message}
        onChange={(event) => set("message", event.target.value)}
      />
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
      <Button variant="primary" onClick={handleSubmit} disabled={!valid || busy} className={styles.submitButton}>
        Submit ticket
      </Button>
    </Card>
  );
}
