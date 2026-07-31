import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSupportTicketDto } from './dto/create-support-ticket.dto';
import { AddSupportMessageDto } from './dto/add-support-message.dto';
import { mapTicket, SupportTicketWithMessages } from './support.mapper';

const TICKET_INCLUDE = { messages: { orderBy: { createdAt: 'asc' } } } satisfies Prisma.SupportTicketInclude;

/** Owner-scoped (auth). Every read/write resolves the ticket owner from `@CurrentUser()`, never a route param — a shopper can only ever see/touch their own tickets. */
@Injectable()
export class SupportService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, dto: CreateSupportTicketDto) {
    const ticket = await this.prisma.supportTicket.create({
      data: {
        userId,
        subject: dto.subject,
        channel: dto.channel,
        orderRef: dto.orderRef,
        messages: { create: [{ sender: 'user', body: dto.message }] },
      },
      include: TICKET_INCLUDE,
    });
    return mapTicket(ticket as SupportTicketWithMessages);
  }

  async listMine(userId: string) {
    const rows = await this.prisma.supportTicket.findMany({
      where: { userId },
      include: TICKET_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((r) => mapTicket(r as SupportTicketWithMessages));
  }

  /** Owner-scoped: 404s (not 403) when the ticket exists but belongs to someone else. */
  async getById(userId: string, id: string) {
    const ticket = await this.getOwned(userId, id);
    return mapTicket(ticket);
  }

  /**
   * `sender` is derived from the caller's own role, never client-supplied
   * — a consumer always posts as `"user"`; an admin acting on someone
   * else's ticket (M11 support-queue surface, not built yet) would post
   * as `"agent"`. Still owner-scoped for a consumer caller (can only add
   * to their own ticket); an admin isn't scoped by `userId` here since
   * this endpoint has no admin-bypass wired yet — flagged as a seam for
   * M8.3b/M11, not needed for this milestone's consumer-facing flow.
   */
  async addMessage(userId: string, role: UserRole, id: string, dto: AddSupportMessageDto) {
    const ticket = await this.getOwned(userId, id);
    const sender = role === 'admin' ? 'agent' : 'user';

    await this.prisma.supportMessage.create({
      data: { ticketId: id, sender, body: dto.body },
    });
    // Re-writes `status` purely to bump `updatedAt` (`@updatedAt` only
    // fires on a real `.update()` call, not a no-op) — a new message
    // should always move a ticket to the top of a "most recently active"
    // list.
    //
    // A customer writing back on a ticket we called `resolved` reopens it
    // (M15). Otherwise the answer to "did that actually fix it?" lands in
    // a bucket the admin queue treats as done, and disagreeing with a
    // resolution would be the one message nobody reads.
    const nextStatus =
      sender === 'user' && ticket.status === 'resolved' ? 'in_progress' : ticket.status;
    await this.prisma.supportTicket.update({ where: { id }, data: { status: nextStatus } });

    return this.getById(userId, id);
  }

  private async getOwned(userId: string, id: string): Promise<SupportTicketWithMessages> {
    const ticket = await this.prisma.supportTicket.findUnique({ where: { id }, include: TICKET_INCLUDE });
    if (!ticket || ticket.userId !== userId) throw new NotFoundException('Support ticket not found');
    return ticket as SupportTicketWithMessages;
  }
}
