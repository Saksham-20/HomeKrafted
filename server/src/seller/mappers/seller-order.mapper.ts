import { Order, OrderItem, OrderShipment } from '@prisma/client';
import { orderStatusToFrontend } from '../../orders/order.mapper';

/**
 * An order item carrying the one fact ownership checks need: whose
 * product it is. A hamper line's own `productId` is NULL — it points at
 * a `Hamper` instead — so its maker has to be read off the hamper's
 * `HamperItem`s. `POST /cart/hamper-items` gates a hamper to one maker
 * across every `HamperItem` it holds, so any one of them is enough to
 * resolve it; there is no "first item" ambiguity.
 */
export type SellerOrderItem = OrderItem & {
  product: { vendorId: string } | null;
  hamper: { items: { product: { vendorId: string } }[] } | null;
};

/** The vendor a line belongs to, whether it names a product directly or through a hamper. */
export function itemVendorId(item: SellerOrderItem): string | undefined {
  return item.product?.vendorId ?? item.hamper?.items[0]?.product.vendorId;
}

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
  const own = order.items.filter((i) => itemVendorId(i) === vendorId);
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
    // 2026-09-17 — the kitchen needs to know a campus order is collected
    // by us rather than by a courier, because "packed" is where their
    // part ends either way but the screen otherwise promises a rider.
    deliveryMode: order.deliveryMode === 'isb_campus' ? ('isb-campus' as const) : ('standard' as const),
    // True when another kitchen's items share this order. Drives the
    // client-side explainer for why shipped/delivered are admin-only
    // moves on a shared order — see `SellerOrdersService.advance`.
    multiVendor: order.items.some((i) => itemVendorId(i) !== vendorId),
  };
}
