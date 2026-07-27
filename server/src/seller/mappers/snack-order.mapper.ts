import { SnackOrder, SnackOrderItem } from '@prisma/client';

export type SnackOrderWithItems = SnackOrder & { items: SnackOrderItem[] };

/** `out_for_delivery` is the one hyphenated-in-the-frontend member — same `@map`-vs-declared-identifier reasoning as `laundry.mapper.ts#bookingStatusToFrontend`. */
export function snackOrderStatusToFrontend(status: SnackOrder['status']): string {
  return status === 'out_for_delivery' ? 'out-for-delivery' : status;
}

export function mapSnackOrder(order: SnackOrderWithItems) {
  return {
    id: order.id,
    sellerId: order.sellerId,
    customerName: order.customerName,
    customerPhone: order.customerPhone,
    items: order.items.map((i) => ({
      snackId: i.snackId,
      name: i.name,
      quantity: i.quantity,
      price: Number(i.price),
    })),
    total: Number(order.total),
    channel: order.channel,
    status: snackOrderStatusToFrontend(order.status),
    createdAt: order.createdAt.toISOString(),
  };
}
