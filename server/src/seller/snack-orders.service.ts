import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, SnackOrderStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { mapSnackOrder } from './mappers/snack-order.mapper';

const SNACK_ORDER_INCLUDE = { items: true } satisfies Prisma.SnackOrderInclude;

/** Mirrors the WhatsApp status timeline the consumer sees on `/snacks` — `client/lib/api/seller.ts#SNACK_ORDER_SEQUENCE`. */
export const SNACK_ORDER_SEQUENCE: SnackOrderStatus[] = ['received', 'accepted', 'out_for_delivery', 'delivered'];

export function nextSnackOrderStatus(status: SnackOrderStatus): SnackOrderStatus | undefined {
  const index = SNACK_ORDER_SEQUENCE.indexOf(status);
  if (index === -1 || index === SNACK_ORDER_SEQUENCE.length - 1) return undefined;
  return SNACK_ORDER_SEQUENCE[index + 1];
}

/** Snack seller — inbound `SnackOrder`s scoped to `sellerId`; an order for a different seller 404s. */
@Injectable()
export class SellerSnackOrdersService {
  constructor(private readonly prisma: PrismaService) {}

  async list(sellerId: string) {
    const rows = await this.prisma.snackOrder.findMany({
      where: { sellerId },
      include: SNACK_ORDER_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(mapSnackOrder);
  }

  async getOne(sellerId: string, orderId: string) {
    const order = await this.assertOwned(sellerId, orderId);
    return mapSnackOrder(order);
  }

  async advance(sellerId: string, orderId: string) {
    const order = await this.assertOwned(sellerId, orderId);
    const next = nextSnackOrderStatus(order.status);
    if (!next) {
      throw new ConflictException(`Order is already at a terminal status ("${order.status}")`);
    }
    const updated = await this.prisma.snackOrder.update({
      where: { id: orderId },
      data: { status: next },
      include: SNACK_ORDER_INCLUDE,
    });
    return mapSnackOrder(updated);
  }

  private async assertOwned(sellerId: string, orderId: string) {
    const order = await this.prisma.snackOrder.findUnique({ where: { id: orderId }, include: SNACK_ORDER_INCLUDE });
    if (!order || order.sellerId !== sellerId) {
      throw new NotFoundException('Snack order not found');
    }
    return order;
  }
}
