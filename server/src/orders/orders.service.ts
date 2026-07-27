import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { computeCashback, computeShipping } from '../common/pricing/pricing.util';
import { RawCartItem, resolveCartLine } from '../common/pricing/resolve-cart-line';
import { IdempotencyService } from '../common/idempotency/idempotency.service';
import { WalletService } from '../wallet/wallet.service';
import { LaundryService } from '../laundry/laundry.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { ListOrdersQueryDto } from './dto/list-orders.query.dto';
import { mapOrder, orderStatusToFrontend } from './order.mapper';
import { toOrderHistoryEntry, toLaundryHistoryEntry } from './order-history.util';

const ORDER_INCLUDE = { items: true, shipments: true } satisfies Prisma.OrderInclude;

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly walletService: WalletService,
    private readonly idempotency: IdempotencyService,
    private readonly laundryService: LaundryService,
  ) {}

  /**
   * Creates an order from the caller's current `Cart` — never from
   * anything client-submitted. Every line's price is recomputed fresh
   * from the DB (`resolveCartLine`, the same function `CartService.getCart`
   * uses, so a shopper's cart preview and what they're actually charged
   * can never disagree), snapshotted onto `OrderItem.price` so the order
   * doesn't drift if the catalog price changes later. Stock is validated
   * up front and then re-validated + decremented atomically inside the
   * transaction (`updateMany` with a `stock: { gte }` guard) to close the
   * race where two requests could otherwise both pass the pre-check.
   *
   * Status starts at `pending_payment` — this milestone does not move
   * money. `walletApplied` records the shopper's payment-method *intent*
   * only; M8.2 owns the actual wallet debit / Razorpay capture and the
   * `pending_payment` -> `placed` transition (see `order.mapper.ts`'s doc
   * comment on the status enum).
   */
  async create(userId: string, dto: CreateOrderDto) {
    const cart = await this.prisma.cart.findUnique({ where: { userId } });
    if (!cart) throw new BadRequestException('Cart is empty');

    const rawItems: RawCartItem[] = await this.prisma.cartItem.findMany({ where: { cartId: cart.id } });
    if (rawItems.length === 0) throw new BadRequestException('Cart is empty');

    const isGift = !!dto.gift;
    if (isGift) {
      const recipientAddress = await this.prisma.address.findUnique({
        where: { id: dto.gift!.recipientAddressId },
      });
      if (!recipientAddress || recipientAddress.userId !== userId) {
        throw new NotFoundException('Gift recipient address not found');
      }
    }

    const defaultAddress = dto.defaultAddressId
      ? undefined
      : await this.prisma.address.findFirst({ where: { userId, isDefault: true } });
    const fallbackAddressId = dto.defaultAddressId ?? defaultAddress?.id;

    const resolvedLines = await Promise.all(rawItems.map((item) => resolveCartLine(this.prisma, item)));

    const addressIdByItemId = new Map<string, string>();
    for (const item of rawItems) {
      const addressId = isGift ? dto.gift!.recipientAddressId : (item.addressId ?? fallbackAddressId);
      if (!addressId) {
        throw new BadRequestException(
          `No shipping address for cart item ${item.id} — assign one via POST /cart/items/:id/address or pass defaultAddressId`,
        );
      }
      addressIdByItemId.set(item.id, addressId);
    }

    const distinctAddressIds = [...new Set(addressIdByItemId.values())];
    const ownedAddresses = await this.prisma.address.findMany({
      where: { id: { in: distinctAddressIds }, userId },
    });
    if (ownedAddresses.length !== distinctAddressIds.length) {
      throw new NotFoundException('One or more shipping addresses were not found on this account');
    }

    // Stock pre-check (fast-fail before opening a transaction) — the
    // transaction below re-checks + decrements atomically, which is the
    // actual race-safe guard.
    for (const item of rawItems) {
      if (item.productId && item.sku) {
        const weight = await this.prisma.weightOption.findUnique({ where: { sku: item.sku } });
        if (!weight || weight.stock < item.quantity) {
          throw new BadRequestException(`Insufficient stock for ${item.sku}`);
        }
      }
    }

    const subtotal = resolvedLines.reduce((sum, l) => sum + l.lineTotal, 0);
    const shippingFee = computeShipping(subtotal);
    const cashbackEarned = computeCashback(subtotal);
    const total = subtotal + shippingFee;
    const walletApplied = dto.paymentMethod === 'wallet' ? total : 0;

    const deliveryDateByAddress = new Map<string, string | undefined>();
    for (const shipment of dto.shipments ?? []) {
      deliveryDateByAddress.set(shipment.addressId, shipment.deliveryDate);
    }

    const created = await this.prisma.$transaction(async (tx) => {
      for (const item of rawItems) {
        if (item.productId && item.sku) {
          const result = await tx.weightOption.updateMany({
            where: { sku: item.sku, stock: { gte: item.quantity } },
            data: { stock: { decrement: item.quantity } },
          });
          if (result.count === 0) {
            throw new ConflictException(`Insufficient stock for ${item.sku} — try again`);
          }
        }
      }

      const orderNumber = await this.generateOrderNumber(tx);

      const order = await tx.order.create({
        data: {
          orderNumber,
          userId,
          status: 'pending_payment',
          shippingAddressIds: distinctAddressIds,
          giftIsGift: isGift,
          giftRecipientName: dto.gift?.recipientName,
          giftRecipientAddressId: isGift ? dto.gift!.recipientAddressId : undefined,
          giftHidePrice: dto.gift?.hidePrice ?? false,
          giftMessage: dto.gift?.message,
          subtotal,
          shippingFee,
          total,
          walletApplied,
          cashbackEarned,
          paymentMethod: dto.paymentMethod,
          items: {
            create: rawItems.map((item, index) => {
              const resolved = resolvedLines[index];
              return {
                productId: item.productId ?? undefined,
                sku: resolved.sku ?? undefined,
                hamperId: item.hamperId ?? undefined,
                name: resolved.name,
                quantity: item.quantity,
                price: resolved.unitPrice,
                addressId: addressIdByItemId.get(item.id)!,
                giftWrap: item.giftWrap,
              };
            }),
          },
          shipments: {
            create: distinctAddressIds.map((addressId) => {
              const deliveryDate = deliveryDateByAddress.get(addressId);
              return { addressId, deliveryDate: deliveryDate ? new Date(deliveryDate) : undefined };
            }),
          },
        },
        include: ORDER_INCLUDE,
      });

      await tx.cartItem.deleteMany({ where: { cartId: cart.id } });

      return order;
    });

    return mapOrder(created);
  }

  async list(userId: string, query: ListOrdersQueryDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const [rows, total] = await Promise.all([
      this.prisma.order.findMany({
        where: { userId },
        include: ORDER_INCLUDE,
        orderBy: { placedAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.order.count({ where: { userId } }),
    ]);
    return { items: rows.map(mapOrder), page, pageSize, total };
  }

  /** Owner-scoped: 404s (not 403) when the order exists but belongs to someone else — never confirms/denies existence to a non-owner. */
  async getById(userId: string, id: string) {
    const order = await this.prisma.order.findUnique({ where: { id }, include: ORDER_INCLUDE });
    if (!order || order.userId !== userId) throw new NotFoundException('Order not found');
    return mapOrder(order);
  }

  /**
   * `client/lib/api/history.ts#getOrderHistory`'s unified shape — merges
   * marketplace `Order`s and `LaundryBooking`s into one list, newest
   * first, exactly mirroring the mock's own merge-then-sort. `SnackOrder`
   * is deliberately excluded (no `userId` FK — see
   * `order-history.util.ts`'s doc comment on `toLaundryHistoryEntry`).
   */
  async history(userId: string) {
    const [orders, bookings] = await Promise.all([
      this.prisma.order.findMany({ where: { userId }, include: ORDER_INCLUDE, orderBy: { placedAt: 'desc' } }),
      this.laundryService.listBookingsForHistory(userId),
    ]);

    const serviceIds = [...new Set(bookings.flatMap((b) => b.lines.map((l) => l.serviceId)))];
    const services = serviceIds.length
      ? await this.prisma.laundryService.findMany({ where: { id: { in: serviceIds } } })
      : [];
    const serviceNameById = new Map(services.map((s) => [s.id, s.name]));

    const orderEntries = orders.map((order) => toOrderHistoryEntry(order, mapOrder(order)));
    const bookingEntries = bookings.map((booking) =>
      toLaundryHistoryEntry(booking, serviceNameById.get(booking.lines[0]?.serviceId ?? '')),
    );

    return [...orderEntries, ...bookingEntries].sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
    );
  }

  // -------------------------------------------------------------------
  // M8.2 — completes the M8.1 "pending-payment" seam: the wallet-pay path
  // for an order created with `paymentMethod: "wallet"`. (The Razorpay
  // path instead goes through `POST /payments/razorpay/order` + the
  // webhook — see `PaymentsService`, which calls `markPaidByRazorpayTx`
  // below on a verified `payment.captured`.)
  // -------------------------------------------------------------------

  /**
   * Debits the wallet for `order.total` (read fresh from the DB, never
   * from the client), credits `order.cashbackEarned` (already computed
   * server-side at `create()` time), and transitions the order
   * `pending_payment -> placed` — all inside one transaction via
   * `IdempotencyService.run`, so a retry with the same `Idempotency-Key`
   * can never double-debit. Insufficient balance throws `402` (via
   * `WalletService.postLedgerEntryTx`) and the whole transaction —
   * including the idempotency claim — rolls back, leaving the order
   * exactly as it was (`pending_payment`, wallet untouched).
   */
  async payWithWallet(userId: string, orderId: string, idempotencyKey?: string) {
    return this.idempotency.run(userId, 'orders.payWithWallet', idempotencyKey, async (tx) => {
      const order = await tx.order.findUnique({ where: { id: orderId } });
      if (!order || order.userId !== userId) throw new NotFoundException('Order not found');
      if (order.paymentMethod !== 'wallet') {
        throw new BadRequestException(
          `Order payment method is "${order.paymentMethod}", not "wallet" — pay via POST /payments/razorpay/order instead`,
        );
      }
      if (order.status !== 'pending_payment') {
        throw new ConflictException(`Order is not awaiting payment (status: ${orderStatusToFrontend(order.status)})`);
      }

      const wallet = await this.walletService.getOrCreateWalletTx(tx, userId);
      const total = Number(order.total);

      await this.walletService.postLedgerEntryTx(tx, {
        walletId: wallet.id,
        direction: 'debit',
        category: 'payment',
        amount: total,
        title: `Paid — Order #${order.orderNumber}`,
        refType: 'order',
        refId: order.id,
      });

      const cashback = Number(order.cashbackEarned);
      if (cashback > 0) {
        await this.walletService.postLedgerEntryTx(tx, {
          walletId: wallet.id,
          direction: 'credit',
          category: 'cashback',
          amount: cashback,
          title: `Cashback — Order #${order.orderNumber}`,
          refType: 'order',
          refId: order.id,
          lifetimeSavedDelta: cashback,
        });
      }

      const updated = await tx.order.update({
        where: { id: orderId },
        data: { status: 'placed' },
        include: ORDER_INCLUDE,
      });
      return mapOrder(updated);
    });
  }

  /**
   * Admin-gated (`@Roles('admin')` at the controller). Credits the order
   * owner's wallet for `order.total` (`category: "refund"`, read fresh
   * from the DB) and marks `refundStatus: "refunded"`. Idempotent both via
   * the optional `Idempotency-Key` and by short-circuiting to a no-op read
   * when the order is already refunded, so retrying a refund call never
   * double-credits even without a key.
   */
  async refundOrder(adminUserId: string, orderId: string, idempotencyKey?: string) {
    return this.idempotency.run(adminUserId, 'orders.refund', idempotencyKey, async (tx) => {
      const order = await tx.order.findUnique({ where: { id: orderId } });
      if (!order) throw new NotFoundException('Order not found');

      if (order.refundStatus === 'refunded') {
        const current = await tx.order.findUniqueOrThrow({ where: { id: orderId }, include: ORDER_INCLUDE });
        return mapOrder(current);
      }
      if (order.status === 'pending_payment') {
        throw new ConflictException('Cannot refund an order that was never paid');
      }

      const wallet = await this.walletService.getOrCreateWalletTx(tx, order.userId);
      const amount = Number(order.total);

      await this.walletService.postLedgerEntryTx(tx, {
        walletId: wallet.id,
        direction: 'credit',
        category: 'refund',
        amount,
        title: `Refund — Order #${order.orderNumber}`,
        refType: 'order',
        refId: order.id,
      });

      const updated = await tx.order.update({
        where: { id: orderId },
        data: { refundStatus: 'refunded' },
        include: ORDER_INCLUDE,
      });
      return mapOrder(updated);
    });
  }

  /**
   * Tx-scoped — called only from `PaymentsService.handleWebhook` (inside
   * its own transaction, after HMAC verification + webhook-event dedup),
   * never from a controller directly. Transitions `pending_payment ->
   * placed` and credits cashback; a no-op if the order was already
   * transitioned (defensive idempotency for a redelivered/duplicate
   * webhook that somehow got past the `WebhookEvent` dedup check).
   */
  async markPaidByRazorpayTx(tx: Prisma.TransactionClient, orderId: string): Promise<void> {
    const order = await tx.order.findUnique({ where: { id: orderId } });
    if (!order || order.status !== 'pending_payment') return;

    await tx.order.update({ where: { id: orderId }, data: { status: 'placed' } });

    const cashback = Number(order.cashbackEarned);
    if (cashback > 0) {
      const wallet = await this.walletService.getOrCreateWalletTx(tx, order.userId);
      await this.walletService.postLedgerEntryTx(tx, {
        walletId: wallet.id,
        direction: 'credit',
        category: 'cashback',
        amount: cashback,
        title: `Cashback — Order #${order.orderNumber}`,
        refType: 'order',
        refId: order.id,
        lifetimeSavedDelta: cashback,
      });
    }
  }

  private async generateOrderNumber(tx: Prisma.TransactionClient): Promise<string> {
    for (let attempt = 0; attempt < 5; attempt++) {
      const count = await tx.order.count();
      const candidate = `HK${2100 + count + attempt}`;
      const exists = await tx.order.findUnique({ where: { orderNumber: candidate } });
      if (!exists) return candidate;
    }
    return `HK${Date.now()}`;
  }
}
