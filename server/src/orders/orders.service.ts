import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { computeCashback, computeShipping } from '../common/pricing/pricing.util';
import { RawCartItem, resolveCartLine } from '../common/pricing/resolve-cart-line';
import { IdempotencyService } from '../common/idempotency/idempotency.service';
import { WalletService } from '../wallet/wallet.service';
import { LaundryService } from '../laundry/laundry.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AdminAuditLogService } from '../admin/audit-log.service';
import { OrderNotificationsService } from './order-notifications.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { ListOrdersQueryDto } from './dto/list-orders.query.dto';
import { mapOrder, orderStatusToFrontend } from './order.mapper';
import { toOrderHistoryEntry, toLaundryHistoryEntry } from './order-history.util';
import { isPurchasable, unavailableReason } from '../catalog/moderation';

const ORDER_INCLUDE = { items: true, shipments: true } satisfies Prisma.OrderInclude;

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly walletService: WalletService,
    private readonly idempotency: IdempotencyService,
    private readonly laundryService: LaundryService,
    private readonly notifications: NotificationsService,
    private readonly orderNotifications: OrderNotificationsService,
    private readonly auditLog: AdminAuditLogService,
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
  /**
   * `idempotencyKey` matters more here than anywhere else on this service.
   *
   * Until the 2026-08-07 audit, this endpoint had none — and the *only*
   * thing standing between a shopper and a duplicate purchase was
   * `CheckoutClient`'s `placing` boolean, which is a React state update
   * and therefore not a lock. Three programmatic clicks in one task
   * produced three real orders, three stock decrements and three wallet
   * debits: ₹894 taken for one ₹298 purchase. A mouse double-click did
   * not reproduce it only because React happened to re-render in the
   * ~50 ms between the two clicks — which is a timing accident, not a
   * guard. Held Enter on a focused button, a slow render, or a client
   * retry over a flaky connection all land in the same place.
   *
   * `POST /orders/:id/pay` was already idempotent, which made this look
   * covered from the server side. It was not: paying twice was prevented,
   * *ordering* twice was not, and each duplicate order carried its own
   * payable total.
   */
  async create(userId: string, dto: CreateOrderDto, idempotencyKey?: string) {
    // Before any validation. The first call empties the cart, so a
    // sequential replay would otherwise fail the "Cart is empty" check
    // below and return a 400 for an order that actually succeeded.
    if (idempotencyKey) {
      const replayed = await this.idempotency.replay<ReturnType<typeof mapOrder>>(
        userId,
        'orders.create',
        idempotencyKey,
      );
      if (replayed) return replayed;
    }

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
    // actual race-safe guard. Batch-fetch every sku in one query (not one
    // findUnique per line) so an N-item cart stays a single round-trip.
    const stockSkus = rawItems.filter((i) => i.productId && i.sku).map((i) => i.sku!);
    if (stockSkus.length > 0) {
      const weights = await this.prisma.weightOption.findMany({
        where: { sku: { in: stockSkus } },
        select: { sku: true, stock: true },
      });
      const stockBySku = new Map(weights.map((w) => [w.sku, w.stock]));
      for (const item of rawItems) {
        if (item.productId && item.sku) {
          const stock = stockBySku.get(item.sku);
          if (stock === undefined || stock < item.quantity) {
            throw new BadRequestException(`Insufficient stock for ${item.sku}`);
          }
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

    // With no key this is exactly the previous behaviour — `run` falls
    // through to a plain `$transaction`.
    return this.idempotency.run(userId, 'orders.create', idempotencyKey, async (tx) => {
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

      // Both sides hear about it. Fired inside the callback but never
      // awaited: a placed order must not roll back because a message
      // failed to send. Inside rather than after, so a *replayed* key
      // returns the stored result without messaging the kitchen a second
      // time about an order it already has.
      void this.orderNotifications.notifyHomeKraftersOfNewOrder(order.id);
      void this.orderNotifications.notifyBuyerOfStatus(order.id, order.status);

      // The mapped DTO is what gets stored against the key, matching
      // `payWithWallet`/`refundOrder`. Storing the raw row instead would
      // put Prisma `Decimal`s and `Date`s through a JSON round trip and
      // hand a replay a differently-shaped body than the first call.
      return mapOrder(order);
    });
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
   * Put a past order back in the cart (M15).
   *
   * Server-side rather than "loop `addItem` in the browser", because a
   * home kitchen's catalogue moves under you: by the time someone
   * reorders, an item may be out of stock, paused for the day
   * (`isAvailable`), delisted by a moderator, or missing the exact weight
   * they bought. Each line is checked against *today's* catalogue and
   * either added or **skipped with a reason the UI can show** — a reorder
   * that silently drops half the order is worse than one that says which
   * half.
   *
   * Partial success is the expected outcome, not an error: adding three
   * of four things and naming the fourth is what the buyer wants.
   */
  async reorder(userId: string, orderId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { items: true },
    });
    if (!order || order.userId !== userId) throw new NotFoundException('Order not found');

    const cart = await this.getOrCreateCartForUser(userId);
    const added: { name: string; quantity: number }[] = [];
    const skipped: { name: string; reason: string }[] = [];

    for (const item of order.items) {
      if (!item.productId || !item.sku) {
        // A hamper line. The builder is behind `FEATURES.hamperBuilder`
        // and a hamper is a composed thing, not a SKU — rebuilding one
        // belongs to the builder, not here.
        skipped.push({ name: item.name, reason: "Hampers can't be reordered — build a new one" });
        continue;
      }

      const product = await this.prisma.product.findUnique({
        where: { id: item.productId },
        include: { weightOptions: true },
      });
      if (!product) {
        skipped.push({ name: item.name, reason: 'No longer sold' });
        continue;
      }
      // Allowlist — `=== 'hidden'` before M22, which would have let a
      // reorder pull a pending or rejected listing straight into a cart,
      // past every browse filter.
      if (!isPurchasable(product.moderationStatus)) {
        skipped.push({ name: product.name, reason: unavailableReason(product.moderationStatus) });
        continue;
      }
      if (!product.isAvailable) {
        skipped.push({ name: product.name, reason: "The HomeKrafter isn't making this today" });
        continue;
      }

      const weight = product.weightOptions.find((w) => w.sku === item.sku);
      if (!weight) {
        skipped.push({ name: product.name, reason: 'That size is no longer offered' });
        continue;
      }

      const existing = await this.prisma.cartItem.findFirst({
        where: { cartId: cart.id, productId: product.id, sku: item.sku },
      });
      const wanted = (existing?.quantity ?? 0) + item.quantity;
      if (wanted > weight.stock) {
        skipped.push({
          name: product.name,
          reason: weight.stock === 0 ? 'Out of stock' : `Only ${weight.stock} left`,
        });
        continue;
      }

      if (existing) {
        await this.prisma.cartItem.update({ where: { id: existing.id }, data: { quantity: wanted } });
      } else {
        await this.prisma.cartItem.create({
          data: { cartId: cart.id, productId: product.id, sku: item.sku, quantity: item.quantity },
        });
      }
      added.push({ name: product.name, quantity: item.quantity });
    }

    if (added.length > 0) {
      await this.prisma.cart.update({ where: { id: cart.id }, data: { updatedAt: new Date() } });
    }

    return { added, skipped };
  }

  // -------------------------------------------------------------------
  // Cancellation & returns (M15)
  //
  // `RefundStatus.requested` had been in the enum since M8 with nothing
  // in the product able to reach it. A buyer whose order went wrong had
  // exactly one option — open a support ticket that, until this same
  // milestone, no admin surface could read.
  // -------------------------------------------------------------------

  /**
   * Statuses a buyer may still cancel from. The line is drawn at
   * `packed`: once a home cook has cooked and boxed it, the cost of a
   * cancellation lands on them, not on a warehouse. After that the path
   * is a return.
   */
  private static readonly CANCELLABLE: ReadonlySet<string> = new Set([
    'pending_payment',
    'placed',
    'confirmed',
  ]);

  /** How long after delivery a return can be raised. Food — short by nature. */
  private static readonly RETURN_WINDOW_DAYS = 7;

  /**
   * Buyer-initiated cancellation. Restocks every line and, if money was
   * actually taken, refunds it to the wallet in the same transaction.
   *
   * Refunds to the wallet rather than the original payment method
   * because that is what the rest of this codebase already does
   * (`refundOrder`, admin refunds) — a card reversal through Razorpay is
   * a separate integration, not something to half-introduce here.
   */
  async cancelOrder(userId: string, orderId: string, reason?: string) {
    const result = await this.prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({ where: { id: orderId }, include: ORDER_INCLUDE });
      if (!order || order.userId !== userId) throw new NotFoundException('Order not found');

      if (order.status === 'cancelled') {
        // Idempotent — a double-tap isn't an error, and must not send a
        // second round of "your order was cancelled" messages.
        return { order: mapOrder(order), cancelledNow: false };
      }
      if (!OrdersService.CANCELLABLE.has(order.status)) {
        throw new ConflictException(
          order.status === 'delivered'
            ? 'This order has already been delivered — request a return instead'
            : 'This order is already being prepared and can no longer be cancelled',
        );
      }

      // Stock went down when the order was created, whether or not it was
      // ever paid for, so it comes back regardless of payment state.
      for (const item of order.items) {
        if (!item.sku) continue;
        await tx.weightOption.updateMany({
          where: { sku: item.sku },
          data: { stock: { increment: item.quantity } },
        });
      }

      // `pending_payment` means nothing was ever captured — there is
      // nothing to give back, and crediting a wallet here would mint
      // money out of an abandoned checkout.
      const wasPaid = order.status !== 'pending_payment';
      const refundable = wasPaid && Number(order.total) > 0;
      if (refundable) {
        const wallet = await this.walletService.getOrCreateWalletTx(tx, order.userId);
        await this.walletService.postLedgerEntryTx(tx, {
          walletId: wallet.id,
          direction: 'credit',
          category: 'refund',
          amount: Number(order.total),
          title: `Refund — cancelled order #${order.orderNumber}`,
          refType: 'order',
          refId: order.id,
        });

        /**
         * Take the cashback back too.
         *
         * **Without this, cancelling an order pays you.** Cashback is
         * credited the moment an order reaches `placed`, and cancelling
         * refunded the full total while leaving that credit alone — so
         * place, cancel, keep the cashback, repeat. Measured in a browser:
         * a ₹1,029 order left the wallet ₹51 *up* on a completed
         * place-then-cancel cycle, and nothing bounds how many times that
         * runs. It also inflated `lifetimeSaved`, which drives loyalty
         * tier, so the same loop bought tier progression for free.
         *
         * Affordable by construction: this runs immediately after
         * crediting the full order total back, and cashback is a small
         * percentage of that same total — so the balance can never be
         * short at this point, whatever the buyer spent in between.
         */
        const cashback = Number(order.cashbackEarned);
        if (cashback > 0) {
          await this.walletService.postLedgerEntryTx(tx, {
            walletId: wallet.id,
            direction: 'debit',
            category: 'cashback',
            amount: cashback,
            title: `Cashback reversed — cancelled order #${order.orderNumber}`,
            refType: 'order',
            refId: order.id,
            // Negative, so the loyalty account unwinds by exactly what the
            // placement added rather than double-counting the reversal.
            lifetimeSavedDelta: -cashback,
            // An accounting correction, not spending. Without this the
            // reversal counts as a debit and can trip an auto-top-up —
            // charging somebody's card because we took back a promotion.
            skipAutoTopupCheck: true,
          });
        }
      }

      const updated = await tx.order.update({
        where: { id: orderId },
        data: {
          status: 'cancelled',
          cancelledAt: new Date(),
          refundReason: reason,
          refundRequestedAt: reason ? new Date() : undefined,
          refundStatus: refundable ? 'refunded' : order.refundStatus,
        },
        include: ORDER_INCLUDE,
      });
      return { order: mapOrder(updated), cancelledNow: true };
    });

    // Outside the transaction: a HomeKrafter may be halfway through
    // cooking this, and telling them is worth more than the message being
    // transactional with the refund.
    if (result.cancelledNow) {
      void this.orderNotifications.notifyBuyerOfStatus(orderId, 'cancelled');
      void this.orderNotifications.notifyHomeKraftersOfCancellation(orderId);
    }
    return result.order;
  }

  /**
   * Buyer-initiated return request. Records the claim and hands it to a
   * human — it does **not** move money. Whether a homemade jar of pickle
   * that "tasted off" earns a refund is a judgement call, and auto-
   * refunding it would make the platform's most abusable path also its
   * most frictionless one. An admin resolves it with the existing
   * `POST /admin/orders/order/:id/refund`.
   */
  async requestReturn(userId: string, orderId: string, reason: string) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId }, include: ORDER_INCLUDE });
    if (!order || order.userId !== userId) throw new NotFoundException('Order not found');

    if (order.status !== 'delivered') {
      throw new ConflictException('Only a delivered order can be returned');
    }
    if (order.refundStatus !== 'none') {
      throw new ConflictException('A refund is already in progress for this order');
    }

    // Pre-M15 rows have no `deliveredAt`; `placedAt` is the only date
    // they carry, and it's the conservative choice (an older window).
    const deliveredAt = order.deliveredAt ?? order.placedAt;
    const windowMs = OrdersService.RETURN_WINDOW_DAYS * 24 * 60 * 60 * 1000;
    if (Date.now() - deliveredAt.getTime() > windowMs) {
      throw new ConflictException(
        `Returns close ${OrdersService.RETURN_WINDOW_DAYS} days after an order — contact support if something's wrong`,
      );
    }

    const updated = await this.prisma.order.update({
      where: { id: orderId },
      data: {
        refundStatus: 'requested',
        refundReason: reason,
        refundRequestedAt: new Date(),
      },
      include: ORDER_INCLUDE,
    });
    return mapOrder(updated);
  }

  /** Mirrors `CartService.getOrCreateCart` — `Cart.userId` is unique, so this can only ever touch the caller's own. */
  private async getOrCreateCartForUser(userId: string) {
    const existing = await this.prisma.cart.findUnique({ where: { userId } });
    if (existing) return existing;
    return this.prisma.cart.create({ data: { userId } });
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

      // Payment captured — the buyer's "we've got it" becomes a real
      // confirmation. Fired inside the transaction callback but never
      // awaited, so a failed message cannot roll back a captured payment.
      void this.orderNotifications.notifyBuyerOfStatus(orderId, 'placed');

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
    // Set only on the pass that actually moves money. A replay — whether
    // it short-circuits on `refundStatus === 'refunded'` below or never
    // runs the callback at all because `IdempotencyService` returned a
    // stored response — leaves this null, so a retried click cannot write
    // a second audit row claiming a second refund.
    let performed: { userId: string; orderNumber: string; amount: number } | null = null;

    const result = await this.idempotency.run(adminUserId, 'orders.refund', idempotencyKey, async (tx) => {
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
      performed = { userId: order.userId, orderNumber: order.orderNumber, amount };
      return mapOrder(updated);
    });

    // After the transaction, never inside it — a rolled-back refund must
    // not leave an audit row saying it happened. Same contract as every
    // `AdminAuditLogService.log()` call in `server/src/admin/**`.
    //
    // This endpoint is `@Roles('admin')` and had been writing no audit row
    // at all, because `OrdersModule` could not reach the writer without a
    // module cycle. Its twin, `POST /admin/orders/:type/:id/refund`, has
    // always been audited — so the same privileged action was accountable
    // or not depending only on which URL was used.
    if (performed) {
      const { userId, orderNumber, amount } = performed;
      await this.auditLog.log({
        actorId: adminUserId,
        action: 'order.refund',
        targetType: 'order',
        targetId: orderId,
        metadata: { orderNumber, amount, refundedToUserId: userId, via: 'orders.refund' },
      });
    }

    return result;
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

    // Same as the wallet path: the webhook is where a card order actually
    // becomes confirmed, so it is where the buyer hears so.
    void this.orderNotifications.notifyBuyerOfStatus(orderId, 'placed');

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
