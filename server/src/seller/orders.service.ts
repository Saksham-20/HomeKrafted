import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { OrderStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { OrderNotificationsService } from '../orders/order-notifications.service';
import { mapOrderForSeller, SellerOrderWithRelations } from './mappers/seller-order.mapper';

const SELLER_ORDER_INCLUDE = {
  items: { include: { product: { select: { vendorId: true } } } },
  shipments: true,
} satisfies Prisma.OrderInclude;

/**
 * The fulfilment pipeline a maker seller can advance an order through —
 * mirrors `client/lib/api/seller.ts`'s `FULFILLMENT_SEQUENCE` exactly,
 * using the Prisma enum's declared identifiers (`pending_payment` is not
 * in this list — a seller cannot advance an order that hasn't been paid
 * yet; `cancelled`/`returned` are terminal and never advance).
 */
export const FULFILLMENT_SEQUENCE: OrderStatus[] = ['placed', 'confirmed', 'packed', 'shipped', 'delivered'];

export function nextFulfillmentStatus(status: OrderStatus): OrderStatus | undefined {
  const index = FULFILLMENT_SEQUENCE.indexOf(status);
  if (index === -1 || index === FULFILLMENT_SEQUENCE.length - 1) return undefined;
  return FULFILLMENT_SEQUENCE[index + 1];
}

/**
 * Maker order fulfilment — scoped to orders containing at least one item
 * from this seller's own vendor. An order that exists but has none of
 * this vendor's items 404s, same "never confirm/deny another owner's
 * resource" rule every other owner-scoped module follows.
 *
 * Every response is the seller-scoped projection (`mapOrderForSeller`,
 * M37): a participant in a multi-vendor order sees their own lines and
 * destinations, never the other kitchens' items, the buyer's identity or
 * the whole-order money.
 */
@Injectable()
export class SellerOrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly orderNotifications: OrderNotificationsService,
  ) {}

  async list(vendorId: string) {
    const orders = await this.prisma.order.findMany({
      where: { items: { some: { product: { vendorId } } } },
      include: SELLER_ORDER_INCLUDE,
      orderBy: { placedAt: 'desc' },
    });
    return orders.map((order) => mapOrderForSeller(order, vendorId));
  }

  async getOne(vendorId: string, orderId: string) {
    const order = await this.assertOwned(vendorId, orderId);
    return mapOrderForSeller(order, vendorId);
  }

  async advance(vendorId: string, orderId: string) {
    const order = await this.assertOwned(vendorId, orderId);
    const next = nextFulfillmentStatus(order.status);
    if (!next) {
      throw new ConflictException(`Order is already at a terminal fulfillment status ("${order.status}")`);
    }

    // A graded guard for orders shared between kitchens (M37).
    // `confirmed` and `packed` describe the caller's own prep, so any
    // participant may record them — that also closes the buyer's cancel
    // window, which was already true. `shipped` and `delivered` are
    // whole-order claims: `delivered` stamps `deliveredAt`, starts the
    // return clock, and is the payout basis for *every* vendor's lines —
    // so on a shared order those moves belong to an admin, who can see
    // all of it. A missing product row (legacy hamper line) counts as
    // another vendor's: the safe direction.
    if (next === 'shipped' || next === 'delivered') {
      const foreign = order.items.some((i) => i.product?.vendorId !== vendorId);
      if (foreign) {
        throw new ForbiddenException(
          "This order also contains another HomeKrafter's items, so shipping and delivery are recorded for the whole order at once. The Homekrafted team updates it — mention the order number to support.",
        );
      }
    }

    const updated = await this.prisma.order.update({
      where: { id: orderId },
      data: {
        status: next,
        // Stamped here because this is where "delivered" actually
        // happens. M15's return window counts from it.
        ...(next === 'delivered' ? { deliveredAt: new Date() } : {}),
      },
      include: SELLER_ORDER_INCLUDE,
    });

    // The buyer hears about every advance. This is the path that fires
    // most often — a HomeKrafter tapping through packed, shipped,
    // delivered — and before M18 it was completely silent.
    void this.orderNotifications.notifyBuyerOfStatus(orderId, next);

    return mapOrderForSeller(updated, vendorId);
  }

  private async assertOwned(vendorId: string, orderId: string): Promise<SellerOrderWithRelations> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: SELLER_ORDER_INCLUDE,
    });
    const ownsAnItem = order?.items.some((item) => item.product?.vendorId === vendorId);
    if (!order || !ownsAnItem) {
      throw new NotFoundException('Order not found');
    }
    return order;
  }
}
