import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { CorporateInquiryStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { EmailProviderService } from '../notifications/providers/email.provider';
import { ConfigService } from '@nestjs/config';
import { CorporateQuotesService } from '../corporate/corporate-quotes.service';
import { mapAdminCorporateInquiry } from '../corporate/corporate.mapper';
import { AdminAuditLogService } from './audit-log.service';
import { CreateQuoteDto, UpdateQuoteDto } from '../corporate/dto/quote.dto';

const STATUSES: CorporateInquiryStatus[] = ['new', 'contacted', 'quoted', 'closed'];

/**
 * The corporate queue (M20) — the missing reader for a table the public
 * form has been writing since M7b.
 *
 * `CorporateInquiry` had a live `@Public()` POST, a 203-line form behind
 * it, and nothing anywhere that read a row. One Diwali corporate order is
 * ₹5k–₹50k against ₹120/day for a meal plan, so the leads sitting unread
 * were the most valuable thing the platform was throwing away.
 *
 * Unscoped, like every other service in this module.
 */
@Injectable()
export class AdminCorporateService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AdminAuditLogService,
    private readonly quotes: CorporateQuotesService,
    private readonly email: EmailProviderService,
    private readonly config: ConfigService,
  ) {}

  async list(status?: string) {
    if (status && !STATUSES.includes(status as CorporateInquiryStatus)) {
      throw new BadRequestException(`Unknown status "${status}".`);
    }

    const rows = await this.prisma.corporateInquiry.findMany({
      where: status ? { status: status as CorporateInquiryStatus } : undefined,
      include: { _count: { select: { quotes: true } } },
      orderBy: { createdAt: 'desc' },
    });

    const items = rows.map(mapAdminCorporateInquiry);
    return {
      items,
      summary: {
        // The number that matters on a queue: how many nobody has touched.
        unworked: items.filter((i) => i.status === 'new').length,
        contacted: items.filter((i) => i.status === 'contacted').length,
        quoted: items.filter((i) => i.status === 'quoted').length,
      },
    };
  }

  async getById(id: string) {
    const inquiry = await this.require(id);
    return {
      ...mapAdminCorporateInquiry(inquiry),
      quotes: await this.quotes.listForInquiry(id),
    };
  }

  async setStatus(adminUserId: string, id: string, status: string) {
    if (!STATUSES.includes(status as CorporateInquiryStatus)) {
      throw new BadRequestException(`Unknown status "${status}".`);
    }
    const before = await this.require(id);
    const updated = await this.prisma.corporateInquiry.update({
      where: { id },
      data: { status: status as CorporateInquiryStatus },
      include: { _count: { select: { quotes: true } } },
    });

    await this.auditLog.log({
      actorId: adminUserId,
      action: 'corporate.status',
      targetType: 'corporateInquiry',
      targetId: id,
      metadata: { from: before.status, to: status },
    });

    return mapAdminCorporateInquiry(updated);
  }

  async setNotes(adminUserId: string, id: string, internalNotes: string) {
    await this.require(id);
    const updated = await this.prisma.corporateInquiry.update({
      where: { id },
      data: { internalNotes },
      include: { _count: { select: { quotes: true } } },
    });

    await this.auditLog.log({
      actorId: adminUserId,
      action: 'corporate.notes',
      targetType: 'corporateInquiry',
      targetId: id,
    });

    return mapAdminCorporateInquiry(updated);
  }

  async createQuote(adminUserId: string, inquiryId: string, dto: CreateQuoteDto) {
    const quote = await this.quotes.create(adminUserId, inquiryId, dto);
    await this.auditLog.log({
      actorId: adminUserId,
      action: 'corporate.quote.create',
      targetType: 'corporateQuote',
      targetId: quote.id,
      metadata: { inquiryId, total: quote.total },
    });
    return quote;
  }

  async updateQuote(adminUserId: string, quoteId: string, dto: UpdateQuoteDto) {
    const quote = await this.quotes.update(quoteId, dto);
    await this.auditLog.log({
      actorId: adminUserId,
      action: 'corporate.quote.update',
      targetType: 'corporateQuote',
      targetId: quoteId,
      metadata: { total: quote.total },
    });
    return quote;
  }

  /**
   * Sends the quote, and **is the only place the raw token exists**.
   *
   * `send()` returns it once and never stores it, so the email has to go
   * out here or the link is unreachable forever. Without this the `sentAt`
   * column would be a claim nothing backed up.
   */
  async sendQuote(adminUserId: string, quoteId: string) {
    const { quote, token } = await this.quotes.send(quoteId);
    const inquiry = await this.require(quote.inquiryId);

    const siteUrl = this.config.get('siteUrl', { infer: true }) as string | undefined;
    const link = `${siteUrl ?? ''}/corporate/quote/${token}`;
    const validUntil = new Date(quote.validUntil).toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    });

    await this.email.send(
      inquiry.email,
      `Your Homekrafted quote for ${inquiry.companyName}`,
      `Hi ${inquiry.contactName},\n\n` +
        `Here is the quote for ${inquiry.companyName}` +
        `${inquiry.occasion ? ` (${inquiry.occasion})` : ''}.\n\n` +
        `Total: ₹${quote.total.toLocaleString('en-IN')}\n` +
        `Valid until: ${validUntil}\n\n` +
        `Open it here to see the full breakdown and accept:\n${link}\n\n` +
        `The link is unique to you — please don't forward it.\n\n` +
        `— Homekrafted`,
    );

    await this.auditLog.log({
      actorId: adminUserId,
      action: 'corporate.quote.send',
      targetType: 'corporateQuote',
      targetId: quoteId,
      // Never the token, and never its hash.
      metadata: { to: inquiry.email, total: quote.total },
    });

    return quote;
  }

  async revokeQuote(adminUserId: string, quoteId: string) {
    const quote = await this.quotes.revoke(quoteId);
    await this.auditLog.log({
      actorId: adminUserId,
      action: 'corporate.quote.revoke',
      targetType: 'corporateQuote',
      targetId: quoteId,
    });
    return quote;
  }

  private async require(id: string) {
    const inquiry = await this.prisma.corporateInquiry.findUnique({
      where: { id },
      include: { _count: { select: { quotes: true } } },
    });
    if (!inquiry) throw new NotFoundException('Inquiry not found');
    return inquiry;
  }
}
