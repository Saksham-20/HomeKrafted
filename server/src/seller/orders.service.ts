import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { OrderStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { mapOrder } from '../orders/order.mapper';

const SELLER_ORDER_INCLUDE = { items: true, shipments: true } satisfies Prisma.OrderInclude;

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
 * from this seller's own vendor. Ownership check runs by first resolving
 * the vendor's own product ids, then requiring the order to reference one
 * of them; an order that exists but has none of this vendor's items 404s,
 * same "never confirm/deny another owner's resource" rule every other
 * owner-scoped module in this codebase follows.
 */
@Injectable()
export class SellerOrdersService {
  constructor(private readonly prisma: PrismaService) {}

  async list(vendorId: string) {
    const productIds = await this.vendorProductIds(vendorId);
    if (productIds.length === 0) return [];

    const orders = await this.prisma.order.findMany({
      where: { items: { some: { productId: { in: productIds } } } },
      include: SELLER_ORDER_INCLUDE,
      orderBy: { placedAt: 'desc' },
    });
    return orders.map(mapOrder);
  }

  async getOne(vendorId: string, orderId: string) {
    const order = await this.assertOwned(vendorId, orderId);
    return mapOrder(order);
  }

  async advance(vendorId: string, orderId: string) {
    const order = await this.assertOwned(vendorId, orderId);
    const next = nextFulfillmentStatus(order.status);
    if (!next) {
      throw new ConflictException(`Order is already at a terminal fulfillment status ("${order.status}")`);
    }
    const updated = await this.prisma.order.update({
      where: { id: orderId },
      data: { status: next },
      include: SELLER_ORDER_INCLUDE,
    });
    return mapOrder(updated);
  }

  /** "Mango Thokku Pickle ×2, ..." — this seller's line items only, mirrors `client/lib/api/seller.ts#describeSellerOrderItems`. */
  describeItems(order: { items: { productId?: string; name: string; quantity: number }[] }, productIds: Set<string>): string {
    const own = order.items.filter((item) => item.productId && productIds.has(item.productId));
    if (own.length === 0) return '—';
    return own.map((item) => `${item.name} ×${item.quantity}`).join(', ');
  }

  private async vendorProductIds(vendorId: string): Promise<string[]> {
    const products = await this.prisma.product.findMany({ where: { vendorId }, select: { id: true } });
    return products.map((p) => p.id);
  }

  private async assertOwned(vendorId: string, orderId: string) {
    const productIds = await this.vendorProductIds(vendorId);
    if (productIds.length === 0) throw new NotFoundException('Order not found');

    const order = await this.prisma.order.findUnique({ where: { id: orderId }, include: SELLER_ORDER_INCLUDE });
    const ownsAnItem = order?.items.some((item) => item.productId && productIds.includes(item.productId));
    if (!order || !ownsAnItem) {
      throw new NotFoundException('Order not found');
    }
    return order;
  }
}
