import type { SupportChannel, SupportTicket } from "@/lib/types";
import { SUPPORT_CHAT_GREETING, SUPPORT_HOURS, SUPPORT_PHONE_DISPLAY, SUPPORT_PHONE_TEL, currentUser } from "@/lib/data";
import { http, isMockMode } from "./http";

/** Static contact copy — not per-user data, stays client-side content. */
export async function getSupportPhone(): Promise<{ display: string; tel: string; hours: string }> {
  return { display: SUPPORT_PHONE_DISPLAY, tel: SUPPORT_PHONE_TEL, hours: SUPPORT_HOURS };
}

export async function getSupportChatGreeting(): Promise<string> {
  return SUPPORT_CHAT_GREETING;
}

/** Mock-mode-only in-memory ticket "table" — see `createSupportTicket`'s doc comment. */
const supportTickets: SupportTicket[] = [];

export interface CreateSupportTicketInput {
  subject: string;
  channel: SupportChannel;
  message: string;
  orderRef?: string;
}

/**
 * Support tickets (M8.4a — real). Owner-scoped `POST/GET /support/tickets`
 * (`docs/API.md` "Support") — creates the ticket with one opening
 * `sender: "user"` message. Mock mode keeps the pre-M8.4a in-memory
 * "table" (no seed rows — a fresh ticket list is the correct starting
 * state).
 */
export async function createSupportTicket(input: CreateSupportTicketInput): Promise<SupportTicket> {
  if (isMockMode()) {
    const now = new Date().toISOString();
    const id = `sup-${Date.now()}`;
    const ticket: SupportTicket = {
      id,
      userId: currentUser.id,
      subject: input.subject,
      channel: input.channel,
      status: "open",
      orderRef: input.orderRef || undefined,
      createdAt: now,
      updatedAt: now,
      messages: [
        {
          id: `sm-${Date.now()}`,
          ticketId: id,
          sender: "user",
          body: input.message,
          createdAt: now,
        },
      ],
    };
    supportTickets.push(ticket);
    return ticket;
  }

  return http.post<SupportTicket>("/support/tickets", {
    subject: input.subject,
    channel: input.channel,
    message: input.message,
    orderRef: input.orderRef,
  });
}

/** Real mode: `GET /support/tickets` — every ticket of the signed-in account, not just ones raised this session. */
export async function getSupportTickets(): Promise<SupportTicket[]> {
  if (isMockMode()) return supportTickets;
  return http.get<SupportTicket[]>("/support/tickets");
}

/**
 * Add a message to one of your own tickets (M15).
 *
 * The customer half of the dispute loop. `GET /support/tickets` had no
 * call site anywhere and there was no way to reply, so an agent's answer
 * — once M15 gave agents a queue to answer from — would have had nowhere
 * to be read.
 *
 * Writing back on a ticket we marked `resolved` reopens it server-side:
 * "that didn't actually fix it" must not land in a bucket the admin queue
 * treats as done.
 */
export async function addSupportMessage(ticketId: string, body: string): Promise<SupportTicket> {
  if (isMockMode()) {
    const ticket = supportTickets.find((t) => t.id === ticketId);
    if (!ticket) throw new Error("Ticket not found");
    ticket.messages.push({
      id: `sm-${Date.now()}`,
      ticketId,
      sender: "user",
      body,
      createdAt: new Date().toISOString(),
    });
    ticket.updatedAt = new Date().toISOString();
    return ticket;
  }
  return http.post<SupportTicket>(
    `/support/tickets/${encodeURIComponent(ticketId)}/messages`,
    { body },
  );
}
