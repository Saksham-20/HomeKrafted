import { Injectable, Logger } from '@nestjs/common';
import { ProductModerationStatus } from '@prisma/client';
import { NotificationsDeliveryService } from '../notifications/notifications-delivery.service';

/**
 * What the platform tells a HomeKrafter about a decision on their work.
 *
 * **This is the half of moderation that did not exist.** Before M22 an
 * admin could hide a listing and its owner was never told, by any channel,
 * and there was nowhere to record why even if somebody had wanted to. The
 * `AdminAuditLog` row named the action, but an audit log is read by the
 * platform, not by the person whose income just stopped. A kitchen would
 * discover it by noticing their orders had gone quiet.
 *
 * **The reason travels verbatim.** No paraphrasing, no category codes. The
 * one thing a rejected HomeKrafter needs is the sentence that tells them
 * what to change, and rewriting it in the notification layer is how that
 * sentence gets lost.
 *
 * **Category `account`, not `promo`.** This is transactional — it is about
 * something they own and can act on — so it defaults to WhatsApp on. A
 * `promo` category would default WhatsApp off and, worse, a promo block is
 * per-sender: one marketing message costs every future order update to
 * that person (see `CLAUDE.md`, M18).
 *
 * **Nothing here may throw into a caller.** Every method swallows and
 * logs, and callers `void` it — a moderation decision must not roll back
 * because a message failed to send.
 */
@Injectable()
export class ModerationNotificationsService {
  private readonly logger = new Logger(ModerationNotificationsService.name);

  constructor(private readonly delivery: NotificationsDeliveryService) {}

  async productDecided(input: {
    userId: string;
    productId: string;
    productName: string;
    status: ProductModerationStatus;
    reason?: string;
  }): Promise<void> {
    const message = this.message(input.productName, input.status, input.reason);
    if (!message) return;

    try {
      await this.delivery.deliver({
        userId: input.userId,
        category: 'account',
        title: message.title,
        body: message.body,
        refType: 'product',
        refId: input.productId,
      });
    } catch (err) {
      this.logger.error(
        `Could not tell user ${input.userId} that "${input.productName}" was ${input.status}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  /**
   * Copy per decision. `null` means "not worth a message".
   *
   * `pending` returns `null` deliberately: the HomeKrafter put it there
   * themselves by saving it, and messaging someone about a thing they just
   * did is noise. Every other state is something that happened *to* them.
   */
  private message(
    name: string,
    status: ProductModerationStatus,
    reason?: string,
  ): { title: string; body: string } | null {
    switch (status) {
      case 'active':
        return {
          title: `"${name}" is live`,
          body: `Your listing has been approved and is now on Homekrafted. Buyers can find it in the shop, on your storefront and in search.`,
        };
      case 'rejected':
        return {
          title: `"${name}" needs a change before it can go live`,
          body:
            `We could not approve this listing yet.\n\n${reason ?? ''}\n\n` +
            `Edit the listing in your Listings tab and save it — that puts it straight back in the queue for another look.`,
        };
      case 'hidden':
        return {
          title: `"${name}" has been taken down`,
          body:
            `This listing is no longer visible to buyers.\n\n${reason ?? ''}\n\n` +
            `If you think this is a mistake, reply to this message or open a support ticket from your portal.`,
        };
      case 'flagged':
        return {
          title: `"${name}" is under review`,
          body:
            `We have paused this listing while we look into it. It is off the storefront for now.\n\n${reason ?? ''}`,
        };
      case 'pending':
        return null;
      default:
        return null;
    }
  }
}
