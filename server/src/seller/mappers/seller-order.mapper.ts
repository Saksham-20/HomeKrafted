import { Order, OrderItem, OrderShipment } from '@prisma/client';
import { orderStatusToFrontend } from '../../orders/order.mapper';

/** An order item carrying the one fact ownership checks need: whose product it is. */
export type SellerOrderItem = OrderItem & { product: { vendorId: string } | null };

export type SellerOrderWithRelations = Order & {
  items: SellerOrderItem[];
  shipments: OrderShipment[];
};

/**
 * The seller-scoped projection of an order (M37).
 *
 * A multi-vendor order used to be returned whole (`mapOrder`), which
 * handed every participating HomeKrafter the other kitchens' line items,
 * the buyer's `userId` and the whole-order money — none of which they
 * need to pack their own box. This mapper keeps what fulfilment needs
 * (own items, own destinations, the gift card text they may have to
 * write, the payment method) and nothing that describes anybody else's
 * business.
 *
 * `itemsSubtotal` is the caller's own lines only, which is also the
 * figure their payout is computed from — the whole-order `total` was
 * never their number.
 */
export function mapOrderForSeller(order: SellerOrderWithRelations, vendorId: string) {
  const own = order.items.filter((i) => i.product?.vendorId === vendorId);
  const ownAddressIds = new Set(own.map((i) => i.addressId));
  const itemsSubtotal =
    Math.round(own.reduce((sum, i) => sum + Number(i.price) * i.quantity, 0) * 100) / 100;

  return {
    id: order.id,
    orderNumber: order.orderNumber,
    status: orderStatusToFrontend(order.status),
    items: own.map((i) => ({
      id: i.id,
      productId: i.productId ?? undefined,
      sku: i.sku ?? undefined,
      name: i.name,
      quantity: i.quantity,
      price: Number(i.price),
      addressId: i.addressId,
      giftWrap: i.giftWrap,
    })),
    itemsSubtotal,
    shippingAddressIds: order.shippingAddressIds.filter((id) => ownAddressIds.has(id)),
    shipments: order.shipments
      .filter((s) => ownAddressIds.has(s.addressId))
      .map((s) => ({
        addressId: s.addressId,
        deliveryDate: s.deliveryDate ? s.deliveryDate.toISOString() : undefined,
      })),
    gift: order.giftIsGift
      ? {
          isGift: true as const,
          recipientName: order.giftRecipientName ?? undefined,
          recipientAddressId: order.giftRecipientAddressId ?? undefined,
          hidePrice: order.giftHidePrice,
          message: order.giftMessage ?? undefined,
        }
      : undefined,
    placedAt: order.placedAt.toISOString(),
    cancelledAt: order.cancelledAt?.toISOString(),
    deliveredAt: order.deliveredAt?.toISOString(),
    paymentMethod: order.paymentMethod,
    // True when another kitchen's items share this order. Drives the
    // client-side explainer for why shipped/delivered are admin-only
    // moves on a shared order — see `SellerOrdersService.advance`.
    multiVendor: order.items.some((i) => i.product?.vendorId !== vendorId),
  };
}
