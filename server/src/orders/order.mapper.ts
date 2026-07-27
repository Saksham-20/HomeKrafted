import { Order, OrderItem, OrderShipment } from '@prisma/client';

export type OrderWithRelations = Order & { items: OrderItem[]; shipments: OrderShipment[] };

/**
 * `OrderStatus`'s Prisma enum member for the M8.1→M8.2 seam is declared
 * `pending_payment` (Prisma enum identifiers can't contain a hyphen) and
 * `@map("pending-payment")`s the underlying DB value — but the Prisma
 * Client always returns the declared identifier at runtime, not the
 * mapped DB value (same reasoning as `dietary-tag.util.ts`). Converts to
 * the hyphenated form the frontend contract expects.
 */
export function orderStatusToFrontend(status: OrderWithRelations['status']): string {
  return status === 'pending_payment' ? 'pending-payment' : status;
}

export function mapOrder(order: OrderWithRelations) {
  return {
    id: order.id,
    orderNumber: order.orderNumber,
    userId: order.userId,
    status: orderStatusToFrontend(order.status),
    items: order.items.map((i) => ({
      id: i.id,
      productId: i.productId ?? undefined,
      sku: i.sku ?? undefined,
      hamperId: i.hamperId ?? undefined,
      name: i.name,
      quantity: i.quantity,
      price: Number(i.price),
      addressId: i.addressId,
      giftWrap: i.giftWrap,
    })),
    shippingAddressIds: order.shippingAddressIds,
    shipments: order.shipments.map((s) => ({
      addressId: s.addressId,
      deliveryDate: s.deliveryDate ? s.deliveryDate.toISOString() : undefined,
    })),
    gift: order.giftIsGift
      ? {
          isGift: true,
          recipientName: order.giftRecipientName ?? undefined,
          recipientAddressId: order.giftRecipientAddressId ?? undefined,
          hidePrice: order.giftHidePrice,
          message: order.giftMessage ?? undefined,
        }
      : undefined,
    placedAt: order.placedAt.toISOString(),
    subtotal: Number(order.subtotal),
    shippingFee: Number(order.shippingFee),
    total: Number(order.total),
    walletApplied: Number(order.walletApplied),
    cashbackEarned: Number(order.cashbackEarned),
    refundStatus: order.refundStatus,
    paymentMethod: order.paymentMethod,
  };
}
