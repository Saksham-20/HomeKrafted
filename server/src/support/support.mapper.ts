import { SupportMessage, SupportTicket } from '@prisma/client';

export type SupportTicketWithMessages = SupportTicket & { messages: SupportMessage[] };

/** `in_progress` (Prisma enum member — hyphens aren't valid identifiers) `@map`s to `"in-progress"` in the DB but Prisma Client always returns the declared identifier at runtime; converts to the hyphenated form `client/lib/types/shared.ts#SupportTicketStatus` expects. */
export function ticketStatusToFrontend(status: SupportTicket['status']): string {
  return status === 'in_progress' ? 'in-progress' : status;
}

function mapMessage(m: SupportMessage) {
  return {
    id: m.id,
    ticketId: m.ticketId,
    sender: m.sender,
    body: m.body,
    createdAt: m.createdAt.toISOString(),
  };
}

export function mapTicket(ticket: SupportTicketWithMessages) {
  return {
    id: ticket.id,
    userId: ticket.userId,
    subject: ticket.subject,
    channel: ticket.channel,
    status: ticketStatusToFrontend(ticket.status),
    orderRef: ticket.orderRef ?? undefined,
    createdAt: ticket.createdAt.toISOString(),
    updatedAt: ticket.updatedAt.toISOString(),
    messages: ticket.messages.map(mapMessage),
  };
}
