import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OrderStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AppConfig } from '../config/configuration';
import { NotificationsDeliveryService } from '../notifications/notifications-delivery.service';
import { buyerOrderMessage } from './order-status-copy';

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
/** What a buyer is told the courier is called. The enum value is ours; the name is theirs. */
const CARRIER_LABEL: Record<string, string> = { shadowfax: 'Shadowfax' };

@Injectable()
export class OrderNotificationsService {
  private readonly logger = new Logger(OrderNotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly delivery: NotificationsDeliveryService,
    private readonly config: ConfigService<AppConfig, true>,
  ) {}

  /**
   * Tell the buyer their parcel has a rider and a waybill
   * (2026-09-04).
   *
   * Distinct from the status message, and both are owed. "Your order is
   * on the way" answers *when*; this answers *how to find it* — the
   * carrier's name, the waybill number and, when the carrier has given
   * us one, its own tracking page. Before this, the AWB existed on the
   * `Consignment` from the moment of booking and reached the buyer on no
   * channel at all: the one identifier a courier's support line asks for
   * was ours and not theirs.
   *
   * Sent when the parcel is **booked**, not when it moves, because that
   * is when the number starts existing and when somebody waiting at home
   * can act on it.
   */
  async notifyBuyerOfDespatch(consignmentId: string): Promise<void> {
    try {
      const consignment = await this.prisma.consignment.findUnique({
        where: { id: consignmentId },
        select: {
          id: true,
          awbNumber: true,
          provider: true,
          trackingUrl: true,
          order: { select: { id: true, userId: true, orderNumber: true } },
        },
      });
      // No waybill means the booking failed and an operator is dealing
      // with it (`/admin/shipping`). Telling a buyer about a parcel that
      // does not exist yet is worse than saying nothing.
      if (!consignment?.awbNumber || !consignment.order) return;

      // `provider` is the enum we book through ("shadowfax"); the buyer
      // reads a name, not an identifier.
      const carrier = CARRIER_LABEL[consignment.provider] ?? 'Our courier partner';
      await this.delivery.deliver({
        userId: consignment.order.userId,
        category: 'order',
        title: `Order ${consignment.order.orderNumber} has a rider`,
        body:
          `${carrier} is collecting it from the kitchen. Waybill ${consignment.awbNumber} — ` +
          `quote that number if you need to ask the courier about it. ` +
          `${consignment.trackingUrl ?? this.trackLink()}`,
        refType: 'order',
        refId: consignment.order.id,
      });
    } catch (err) {
      this.logger.warn(`Could not notify buyer of despatch ${consignmentId}: ${String(err)}`);
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

      const message = buyerOrderMessage(status, order.orderNumber);
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
   * Tell the buyer their money came back.
   *
   * **This was silent until M39.** `OrdersService.refundOrder` credited
   * the wallet, set `refundStatus: 'refunded'` and told nobody — while
   * the admin-issued wallet refund (`AdminWalletService`) did notify. So
   * whether a refunded customer heard about it depended on which screen
   * the admin happened to use, and the one that skipped the message is
   * the one wired to the order.
   *
   * The amount is named because "your refund has been processed" is the
   * message that generates the follow-up question. Where the money went
   * is named too: it is a wallet credit, not a reversal to the card, and
   * a buyer who expects their card statement to change will otherwise
   * wait for something that is never coming.
   *
   * Craft-safe, per the `lib/kitchen-copy.ts` rule — one pipeline
   * carries pickles and candles, so nothing here refers to cooking.
   */
  async notifyBuyerOfRefund(orderId: string, amount: number): Promise<void> {
    try {
      const order = await this.prisma.order.findUnique({
        where: { id: orderId },
        select: { id: true, userId: true, orderNumber: true },
      });
      if (!order) return;

      await this.delivery.deliver({
        userId: order.userId,
        category: 'wallet',
        title: `Refund for order ${order.orderNumber}`,
        body:
          `₹${amount.toFixed(2)} is back in your Homekrafted wallet. ` +
          `It is ready to spend now — it does not return to the card or UPI you paid with. ` +
          `See it at ${this.siteUrl()}/wallet`,
        refType: 'order',
        refId: order.id,
      });
    } catch (err) {
      this.logger.warn(`Could not notify buyer of refund for order ${orderId}: ${String(err)}`);
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
