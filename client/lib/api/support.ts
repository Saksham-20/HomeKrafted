import type { SupportChannel, SupportTicket } from "@/lib/types";
import { SUPPORT_CHAT_GREETING, SUPPORT_HOURS, SUPPORT_PHONE_DISPLAY, SUPPORT_PHONE_TEL, currentUser } from "@/lib/data";

export async function getSupportPhone(): Promise<{ display: string; tel: string; hours: string }> {
  return { display: SUPPORT_PHONE_DISPLAY, tel: SUPPORT_PHONE_TEL, hours: SUPPORT_HOURS };
}

export async function getSupportChatGreeting(): Promise<string> {
  return SUPPORT_CHAT_GREETING;
}

/**
 * In-memory mock ticket "table" — same pattern as `lib/api/orders.ts`'s
 * `orders`: lives entirely in this client-bundle module instance, resets
 * on a hard reload, only ever seen again via client-side navigation
 * within the same tab. No seed rows (a fresh ticket list is the correct
 * starting state, unlike `addresses`/`walletTransactions`).
 */
const supportTickets: SupportTicket[] = [];

export interface CreateSupportTicketInput {
  subject: string;
  channel: SupportChannel;
  message: string;
  orderRef?: string;
}

/**
 * Mock ticket-creation mutation — generates an id, seeds the ticket with
 * the shopper's opening message, and appends to the in-memory
 * `supportTickets` array. Swap for a real `POST /api/support/tickets`
 * call in M8 (ticketing backend) without changing the call site.
 */
export async function createSupportTicket(input: CreateSupportTicketInput): Promise<SupportTicket> {
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

/** Tickets raised live in this browser tab's session — same caveat as `createSupportTicket`. */
export async function getSupportTickets(): Promise<SupportTicket[]> {
  return supportTickets;
}
