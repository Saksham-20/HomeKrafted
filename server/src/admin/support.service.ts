import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, SupportTicketStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { mapTicket, ticketStatusToFrontend, SupportTicketWithMessages } from '../support/support.mapper';
import { AdminAuditLogService } from './audit-log.service';
import { ListAdminSupportQueryDto } from './dto/list-admin-support.query.dto';

const TICKET_INCLUDE = {
  messages: { orderBy: { createdAt: 'asc' } },
  user: { select: { id: true, name: true, email: true, phone: true } },
} satisfies Prisma.SupportTicketInclude;

type AdminTicketRow = Prisma.SupportTicketGetPayload<{ include: typeof TICKET_INCLUDE }>;

/** Adds the customer's identity to the shared ticket shape — the consumer-facing mapper deliberately omits it, since a shopper already knows who they are. */
function mapAdminTicket(ticket: AdminTicketRow) {
  const base = mapTicket(ticket as unknown as SupportTicketWithMessages);
  return {
    ...base,
    userName: ticket.user.name,
    userEmail: ticket.user.email ?? undefined,
    userPhone: ticket.user.phone ?? undefined,
    lastMessageAt: (ticket.messages.at(-1)?.createdAt ?? ticket.createdAt).toISOString(),
    /** True when the newest message came from the customer — i.e. it's our turn. */
    awaitingReply: (ticket.messages.at(-1)?.sender ?? 'user') === 'user',
  };
}

/**
 * The admin dispute queue (M15).
 *
 * `SupportTicket`/`SupportMessage` and the customer-facing
 * `/support/tickets` endpoints shipped in M7b/M8.3a, and
 * `SupportService.addMessage` even had a comment reserving `sender:
 * "agent"` for "the M11 support-queue surface, not built yet". It was
 * never built: tickets were written and nothing could read them. A
 * marketplace where the only remedy for a bad order is a message nobody
 * receives has no dispute resolution at all.
 *
 * Unscoped, like every other service in this module — an admin sees every
 * ticket, and their replies post as `agent`.
 */
const DEFAULT_SUPPORT_PAGE_SIZE = 25;

@Injectable()
export class AdminSupportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AdminAuditLogService,
    private readonly notifications: NotificationsService,
  ) {}

  /**
   * One page of the queue, plus the counts that head it.
   *
   * **The summary is computed independently of the filter**, and used not
   * to be: it was derived from the same already-filtered array, so
   * clicking "Resolved" made the header report `open: 0, in progress: 0,
   * awaiting reply: 0` — a support queue telling an admin nobody is
   * waiting, at the exact moment they narrowed the view. Same class of bug
   * as the catalogue's pending badge, and the reason both counts are now
   * their own queries.
   */
  async list(status?: SupportTicketStatus, query: ListAdminSupportQueryDto = {}) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? DEFAULT_SUPPORT_PAGE_SIZE;
    const where = status ? { status } : undefined;

    const [rows, total, open, inProgress, awaitingReply] = await Promise.all([
      this.prisma.supportTicket.findMany({
        where,
        include: TICKET_INCLUDE,
        // `id` breaks the tie — several tickets can share an `updatedAt`
        // to the millisecond after a bulk status change, and without it a
        // page boundary repeats one and drops another.
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.supportTicket.count({ where }),
      this.prisma.supportTicket.count({ where: { status: 'open' } }),
      this.prisma.supportTicket.count({ where: { status: 'in_progress' } }),
      this.countAwaitingReply(),
    ]);

    return {
      items: rows.map(mapAdminTicket),
      page,
      pageSize,
      total,
      summary: { open, inProgress, awaitingReply },
    };
  }

  /**
   * How many people are waiting on us right now — the one number on this
   * screen with somebody sitting at the other end of it.
   *
   * "Awaiting reply" means the newest message on the ticket came from the
   * customer, which is a per-row lookup rather than a column, so this is
   * raw SQL rather than a `count`. Reading every ticket and its whole
   * message thread to work it out in JavaScript is what it replaces.
   *
   * `resolved` and `closed` are excluded because a customer who writes
   * back on a resolved ticket reopens it (`SupportService.addMessage`) —
   * so anything still sitting in those states genuinely is not waiting.
   *
   * **The status literals are the database's spelling, not Prisma's.**
   * `SupportTicketStatus` declares `in_progress @map("in-progress")`, so
   * Postgres stores `in-progress` and the Prisma-side name is not a member
   * of the enum type at all. Writing `in_progress` here is a 500 rather
   * than a quietly wrong number, which is the one mercy of it — and the
   * reason a raw query needs a test that actually runs it.
   */
  private async countAwaitingReply(): Promise<number> {
    const rows = await this.prisma.$queryRaw<{ count: bigint }[]>`
      SELECT COUNT(*) AS count
      FROM "SupportTicket" t
      WHERE t."status" IN ('open', 'in-progress')
        AND COALESCE(
              (SELECT m."sender"
                 FROM "SupportMessage" m
                WHERE m."ticketId" = t.id
                ORDER BY m."createdAt" DESC, m.id DESC
                LIMIT 1),
              'user'
            ) = 'user'
    `;
    return Number(rows[0]?.count ?? 0);
  }

  async getById(id: string) {
    return mapAdminTicket(await this.require(id));
  }

  /**
   * An agent reply. Moves an `open` ticket to `in-progress` in the same
   * write — a ticket someone has answered is not still untouched, and
   * making the agent set that by hand guarantees the queue lies.
   */
  async reply(adminUserId: string, id: string, body: string) {
    const ticket = await this.require(id);

    await this.prisma.supportMessage.create({
      data: { ticketId: id, sender: 'agent', body },
    });
    await this.prisma.supportTicket.update({
      where: { id },
      // Writing `status` unconditionally also bumps `updatedAt`, which
      // `@updatedAt` only fires on a real update — same trick
      // `SupportService.addMessage` uses to keep the list ordering honest.
      data: { status: ticket.status === 'open' ? 'in_progress' : ticket.status },
    });

    await this.auditLog.log({
      actorId: adminUserId,
      action: 'support.reply',
      targetType: 'SupportTicket',
      targetId: id,
    });

    await this.notifications.notify({
      userId: ticket.userId,
      category: 'account',
      title: 'Support replied',
      body: `We've replied about "${ticket.subject}".`,
      refType: 'support',
      refId: id,
    });

    return this.getById(id);
  }

  async setStatus(adminUserId: string, id: string, status: SupportTicketStatus) {
    const ticket = await this.require(id);
    const updated = await this.prisma.supportTicket.update({
      where: { id },
      data: { status },
      include: TICKET_INCLUDE,
    });

    await this.auditLog.log({
      actorId: adminUserId,
      action: 'support.status',
      targetType: 'SupportTicket',
      targetId: id,
      metadata: { from: ticketStatusToFrontend(ticket.status), to: ticketStatusToFrontend(status) },
    });

    // Resolution is the one status change worth telling someone about —
    // "we consider this done" is a claim they may want to argue with.
    if (status === 'resolved') {
      await this.notifications.notify({
        userId: ticket.userId,
        category: 'account',
        title: 'Support ticket resolved',
        body: `We've marked "${ticket.subject}" resolved. Reply on the ticket if it isn't.`,
        refType: 'support',
        refId: id,
      });
    }

    return mapAdminTicket(updated);
  }

  private async require(id: string): Promise<AdminTicketRow> {
    const ticket = await this.prisma.supportTicket.findUnique({ where: { id }, include: TICKET_INCLUDE });
    if (!ticket) throw new NotFoundException('Support ticket not found');
    return ticket;
  }
}
