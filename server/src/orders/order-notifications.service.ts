import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OrderStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AppConfig } from '../config/configuration';
import { NotificationsDeliveryService } from '../notifications/notifications-delivery.service';

/**
 * Everything the platform says to a human about an order (M18).
 *
 * Split into its own service because three modules move an order between
 * statuses — the buyer places it (`OrdersService`), the HomeKrafter
 * advances it (`SellerOrdersService`), an admin can override it
 * (`AdminOrdersService`) — and before this every one of them was a
 * different amount of silence. A buyer heard nothing after checkout, and a
 * HomeKrafter got an in-app row they would only see if they happened to
 * open the portal.
 *
 * **Delivery, not just an inbox row.** These call
 * `NotificationsDeliveryService.deliver`, which fans out to whatever
 * channels the recipient has on for the category — WhatsApp among them as
 * of M18. `NotificationsService.notify` (inbox only) is still right for
 * things nobody needs to be interrupted for; an order is not one of them.
 *
 * **Nothing here may throw into a caller.** Every method swallows and
 * logs. An order that was paid for must not roll back, and a status a
 * HomeKrafter already advanced must not un-advance, because a message
 * failed to send. Callers use `void this.orderNotifications.x(...)` for
 * the same reason.
 */
@Injectable()
export class OrderNotificationsService {
  private readonly logger = new Logger(OrderNotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly delivery: NotificationsDeliveryService,
    private readonly config: ConfigService<AppConfig, true>,
  ) {}

  /** Buyer-facing copy per status. `null` means "not worth a message". */
  private buyerMessage(
    status: OrderStatus,
    orderNumber: string,
  ): { title: string; body: string } | null {
    switch (status) {
      case 'placed':
      case 'confirmed':
        return {
          title: `Order ${orderNumber} confirmed`,
          body: 'Your order is with the kitchen. We’ll message you when it’s packed and on the way.',
        };
      case 'packed':
        return {
          title: `Order ${orderNumber} is packed`,
          body: 'Freshly made and boxed up. It goes out for delivery next.',
        };
      case 'shipped':
        return {
          title: `Order ${orderNumber} is on the way`,
          body: 'Out for delivery now.',
        };
      case 'delivered':
        return {
          title: `Order ${orderNumber} delivered`,
          body: 'Hope it was worth the wait. You can leave a review from your orders page — the kitchen reads every one.',
        };
      case 'cancelled':
        return {
          title: `Order ${orderNumber} cancelled`,
          body: 'This order has been cancelled. Anything already paid goes back to your Homekrafted wallet.',
        };
      case 'returned':
        return {
          title: `Return for order ${orderNumber} closed`,
          body: 'Your return has been processed. Check your wallet for the refund.',
        };
      // `pending_payment` is not "nothing happened" — a COD order sits
      // here, and so does a card order while the payment sheet is open.
      // What the buyer needs to hear is that the order reached us; saying
      // "confirmed" before capture would be a promise the payment might
      // not keep.
      case 'pending_payment':
        return {
          title: `We’ve got order ${orderNumber}`,
          body: 'Your order is in. We’ll confirm as soon as the kitchen picks it up.',
        };
      default:
        return null;
    }
  }

  /**
   * Tell the buyer their order reached a new status.
   *
   * Called from every path that writes `Order.status`. A transition that
   * forgets this is silent, and silence after paying is the single most
   * common support message on any marketplace.
   */
  async notifyBuyerOfStatus(orderId: string, status: OrderStatus): Promise<void> {
    try {
      const order = await this.prisma.order.findUnique({
        where: { id: orderId },
        select: { id: true, userId: true, orderNumber: true },
      });
      if (!order) return;

      const message = this.buyerMessage(status, order.orderNumber);
      if (!message) return;

      await this.delivery.deliver({
        userId: order.userId,
        category: 'order',
        title: message.title,
        body: `${message.body} ${this.trackLink()}`,
        refType: 'order',
        refId: order.id,
      });
    } catch (err) {
      this.logger.warn(`Could not notify buyer of order ${orderId} (${status}): ${String(err)}`);
    }
  }

  /**
   * Tell each HomeKrafter with something in this order that it came in.
   *
   * One message per HomeKrafter, not per line — an order with three of
   * Anjali's jars pings Anjali once, and it names the items so she can
   * start without opening anything.
   */
  async notifyHomeKraftersOfNewOrder(orderId: string): Promise<void> {
    try {
      const order = await this.prisma.order.findUnique({
        where: { id: orderId },
        include: {
          items: { include: { product: { include: { vendor: { include: { seller: true } } } } } },
        },
      });
      if (!order) return;

      const byUser = new Map<string, { lines: string[]; count: number }>();
      for (const item of order.items) {
        const seller = item.product?.vendor?.seller;
        if (!seller) continue;
        const entry = byUser.get(seller.userId) ?? { lines: [], count: 0 };
        entry.lines.push(`${item.name} ×${item.quantity}`);
        entry.count += item.quantity;
        byUser.set(seller.userId, entry);
      }

      const portal = `${this.siteUrl()}/seller/orders`;

      await Promise.all(
        [...byUser.entries()].map(([userId, { lines, count }]) =>
          this.delivery.deliver({
            userId,
            category: 'order',
            title: `New order ${order.orderNumber}`,
            body:
              `${count} item${count === 1 ? '' : 's'}: ${lines.join(', ')}. ` +
              `Confirm and start packing: ${portal}`,
            refType: 'order',
            refId: order.id,
          }),
        ),
      );
    } catch (err) {
      this.logger.warn(`Could not notify HomeKrafters for order ${orderId}: ${String(err)}`);
    }
  }

  /**
   * Tell each HomeKrafter in an order that it was cancelled.
   *
   * Separate from the buyer's cancellation message and genuinely
   * important: somebody may be halfway through cooking it.
   */
  async notifyHomeKraftersOfCancellation(orderId: string): Promise<void> {
    try {
      const order = await this.prisma.order.findUnique({
        where: { id: orderId },
        include: {
          items: { include: { product: { include: { vendor: { include: { seller: true } } } } } },
        },
      });
      if (!order) return;

      const userIds = new Set<string>();
      for (const item of order.items) {
        const seller = item.product?.vendor?.seller;
        if (seller) userIds.add(seller.userId);
      }

      await Promise.all(
        [...userIds].map((userId) =>
          this.delivery.deliver({
            userId,
            category: 'order',
            title: `Order ${order.orderNumber} was cancelled`,
            body: 'Stop work on this one if you had started. Nothing is owed for it.',
            refType: 'order',
            refId: order.id,
          }),
        ),
      );
    } catch (err) {
      this.logger.warn(`Could not notify HomeKrafters of cancelled order ${orderId}: ${String(err)}`);
    }
  }

  private siteUrl(): string {
    return this.config.get('siteUrl', { infer: true });
  }

  private trackLink(): string {
    return `Track it: ${this.siteUrl()}/account/orders`;
  }
}
