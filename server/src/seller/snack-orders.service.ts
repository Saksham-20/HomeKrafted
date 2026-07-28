import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma, SnackOrderStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { WhatsAppService } from '../whatsapp/whatsapp.service';
import { mapSnackOrder } from './mappers/snack-order.mapper';

const SNACK_ORDER_INCLUDE = { items: true } satisfies Prisma.SnackOrderInclude;

/** Mirrors the WhatsApp status timeline the consumer sees on `/snacks` — `client/lib/api/seller.ts#SNACK_ORDER_SEQUENCE`. */
export const SNACK_ORDER_SEQUENCE: SnackOrderStatus[] = ['received', 'accepted', 'out_for_delivery', 'delivered'];

export function nextSnackOrderStatus(status: SnackOrderStatus): SnackOrderStatus | undefined {
  const index = SNACK_ORDER_SEQUENCE.indexOf(status);
  if (index === -1 || index === SNACK_ORDER_SEQUENCE.length - 1) return undefined;
  return SNACK_ORDER_SEQUENCE[index + 1];
}

/**
 * Snack seller — inbound `SnackOrder`s scoped to `sellerId`; an order for
 * a different seller 404s. `advance` sends the customer a real (or
 * env-gated stub) WhatsApp status message via `WhatsAppService.sendStatus`
 * (M9) after the status transition commits — the message send is
 * best-effort: a WhatsApp failure is logged but never rolls back or
 * blocks the status advance itself (the seller's own record of the order
 * is the source of truth, not the notification).
 */
@Injectable()
export class SellerSnackOrdersService {
  private readonly logger = new Logger(SellerSnackOrdersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly whatsapp: WhatsAppService,
  ) {}

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

    try {
      await this.whatsapp.sendStatus({ phone: updated.customerPhone, name: updated.customerName }, updated.id, next);
    } catch (err) {
      this.logger.error(`WhatsApp status send failed for SnackOrder ${updated.id} -> "${next}": ${(err as Error).message}`);
    }

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
