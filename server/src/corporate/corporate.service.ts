import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsDeliveryService } from '../notifications/notifications-delivery.service';
import { CreateCorporateInquiryDto } from './dto/create-corporate-inquiry.dto';
import { mapCorporateInquiry } from './corporate.mapper';

/**
 * How many admins one inbound inquiry may fan out to.
 *
 * `NotificationsDeliveryService.deliver` awaits sms → whatsapp → email →
 * inapp **per user**. Defaults are in-app only, so today this is a few
 * database rows — but the first admin who turns on email for `account`
 * converts an unauthenticated public endpoint into a metered mail sender,
 * and an unbounded `findMany` is what makes that a cannon rather than a
 * trickle.
 */
const MAX_ADMINS_NOTIFIED = 10;

/**
 * `CorporateInquiry` has no `userId` FK (see `schema.prisma`) — a bulk-
 * gifting inquiry may predate an account, same as `SellerApplication`.
 * `create` is `@Public()` and throttled.
 */
@Injectable()
export class CorporateService {
  private readonly logger = new Logger(CorporateService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsDeliveryService,
  ) {}

  async create(dto: CreateCorporateInquiryDto) {
    const inquiry = await this.prisma.corporateInquiry.create({
      data: {
        companyName: dto.companyName,
        contactName: dto.contactName,
        email: dto.email,
        phone: dto.phone,
        occasion: dto.occasion,
        estimatedQuantity: dto.estimatedQuantity,
        budgetRange: dto.budgetRange,
        message: dto.message,
        orderType: dto.orderType ?? 'corporate',
      },
    });

    /*
      Somebody gets told. Until M20 this wrote a row and notified nobody,
      and nothing read the table — so a ₹5k–₹50k lead arrived and sat
      there. That was the actual bug, not the missing quote builder.

      `void`, outside the write: a lead must not fail to record because a
      message failed to send. `.catch` because an unhandled rejection from
      a floating promise would take the process down.
    */
    void this.notifyAdmins(inquiry.id, dto).catch((err) =>
      this.logger.error(`Failed to notify admins of corporate inquiry ${inquiry.id}`, err),
    );

    return mapCorporateInquiry(inquiry);
  }

  private async notifyAdmins(inquiryId: string, dto: CreateCorporateInquiryDto): Promise<void> {
    const admins = await this.prisma.user.findMany({
      where: { role: 'admin', suspended: false },
      select: { id: true },
      take: MAX_ADMINS_NOTIFIED,
      orderBy: { createdAt: 'asc' },
    });

    const kind = dto.orderType === 'bulk' ? 'Bulk order' : 'Corporate';
    for (const admin of admins) {
      await this.notifications.deliver({
        userId: admin.id,
        category: 'account',
        title: `${kind} enquiry — ${dto.companyName}`,
        body:
          `${dto.contactName} is asking about ${dto.estimatedQuantity} units` +
          `${dto.occasion ? ` for ${dto.occasion}` : ''}. ` +
          `${dto.email} · ${dto.phone}`,
        refType: 'corporateInquiry',
        refId: inquiryId,
      });
    }
  }
}
