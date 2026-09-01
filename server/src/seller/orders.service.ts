import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { OrderStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { OrderNotificationsService } from '../orders/order-notifications.service';
import { ShippingService } from '../shipping/shipping.service';
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
    private readonly shipping: ShippingService,
  ) {}

  /**
   * One page, newest first (M37). This read used to load a kitchen's
   * entire order history — with relations — on every visit to
   * `/seller/orders`, on a table that only grows.
   */
  async list(vendorId: string, page = 1, pageSize = 50) {
    const where = { items: { some: { product: { vendorId } } } } as const;
    const [orders, total] = await Promise.all([
      this.prisma.order.findMany({
        where,
        include: SELLER_ORDER_INCLUDE,
        orderBy: { placedAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.order.count({ where }),
    ]);
    return {
      items: orders.map((order) => mapOrderForSeller(order, vendorId)),
      page,
      pageSize,
      total,
    };
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
      // A rider is carrying this parcel, so the kitchen is no longer the
      // one who knows where it is. Blocking the manual move is what keeps
      // `deliveredAt` — the buyer's return window and every kitchen's
      // payout basis (M15) — meaning "the carrier's proof of delivery"
      // rather than "somebody ticked a box".
      //
      // Narrow on purpose. It bites only for a parcel actually with the
      // carrier: a booking that failed, was cancelled, or was never made
      // leaves the manual path exactly as it was, because the alternative
      // strands a real order behind a courier that never turned up. An
      // admin can always override through `/admin/orders`.
      const held = await this.shipping.hasParcelInFlight(orderId, vendorId);
      if (held) {
        throw new ConflictException(
          'A Shadowfax rider is carrying this order — the status updates itself as the parcel moves. If something has gone wrong with the pickup, tell the Homekrafted team the order number.',
        );
      }

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

    // `packed` is when a parcel exists, so it is when a rider can be
    // asked for. `void`, and the service swallows its own failures: a
    // carrier being down must never stop a home cook recording that they
    // have finished cooking. A booking that does not happen lands in the
    // admin despatch queue with the reason on it.
    if (next === 'packed') void this.shipping.bookForOrder(orderId);

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
