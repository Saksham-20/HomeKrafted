import { randomUUID } from 'crypto';
import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { AppConfig } from '../config/configuration';
import { PrismaService } from '../prisma/prisma.service';
import { OrdersService } from '../orders/orders.service';
import { WalletService } from '../wallet/wallet.service';
import { CreateRazorpayOrderDto } from './dto/create-razorpay-order.dto';
import { RazorpayClient } from './razorpay.client';
import { verifyRazorpaySignature } from './razorpay-signature.util';

/** Dev/test-mode placeholders shipped in `.env.example` — matched exactly so a real (even test-account) key pair always takes the live code path. */
const PLACEHOLDER_KEY_ID = 'rzp_test_placeholder';
const PLACEHOLDER_KEY_SECRET = 'placeholder_secret';

function isUniqueConstraintError(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';
}

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<AppConfig, true>,
    private readonly razorpayClient: RazorpayClient,
    private readonly walletService: WalletService,
    private readonly ordersService: OrdersService,
  ) {}

  /**
   * `true` when `RAZORPAY_KEY_ID`/`_SECRET` are still the `.env.example`
   * dev placeholders (or unset) — the "degrade gracefully" path: a mock
   * Razorpay order id is minted locally instead of calling the real API,
   * so the top-up/checkout flow stays fully exercisable without a real
   * Razorpay account. `RAZORPAY_WEBHOOK_SECRET` still needs to be *some*
   * non-empty value either way — HMAC verification only needs a shared
   * secret, not a real Razorpay account, so it's exercised for real even
   * in mock mode (see `docs/ARCHITECTURE.md`'s payment flow section).
   */
  private isMockMode(): boolean {
    const keyId = this.config.get('razorpay.keyId', { infer: true });
    const keySecret = this.config.get('razorpay.keySecret', { infer: true });
    return !keyId || !keySecret || keyId === PLACEHOLDER_KEY_ID || keySecret === PLACEHOLDER_KEY_SECRET;
  }

  /**
   * Whether a card/UPI payment can actually complete — served publicly by
   * `GET /payments/config` so a client can decide **before** it offers the
   * option, not after it has already created an order it cannot collect.
   *
   * The audit found the alternative: `createOrder` returns `mock: true`
   * and both callers threw the flag away and opened the real Razorpay
   * Checkout SDK with the placeholder key. Razorpay's servers 401, the
   * widget hides itself, and neither `handler` nor `ondismiss` ever fires
   * — so the page is left scroll-locked (`document.body { overflow:
   * hidden }`, set by the SDK) with the awaited promise pending forever.
   * On the wallet that is a dead "Top up" button; at checkout it strands a
   * real `Order` at `pending_payment`.
   *
   * Deliberately derived from the *server's* env rather than from
   * `NEXT_PUBLIC_RAZORPAY_KEY_ID`: the key that decides whether a payment
   * can be captured is this one, and the two can disagree.
   */
  cardPaymentsEnabled(): boolean {
    return !this.isMockMode();
  }

  /**
   * Opens a Razorpay order for either an existing Homekrafted `Order`
   * (`purpose: "order"` — amount is `Order.total`, read fresh from the DB,
   * the client's `amount` field if any is ignored) or a wallet top-up
   * (`purpose: "topup"` — amount is the shopper's declared figure, safe
   * per `RazorpayOrderPurpose`'s schema doc comment). Persists a
   * `RazorpayOrder` row so the webhook handler can later resolve
   * `razorpay_order_id -> {purpose, amount, userId, orderId?, walletId?}`
   * without trusting the webhook payload for any of that.
   */
  async createOrder(userId: string, dto: CreateRazorpayOrderDto) {
    let amount: number;
    let orderRecordId: string | undefined;
    let walletId: string | undefined;

    if (dto.purpose === 'order') {
      if (!dto.orderId) throw new BadRequestException('orderId is required when purpose is "order"');
      const order = await this.prisma.order.findUnique({ where: { id: dto.orderId } });
      if (!order || order.userId !== userId) throw new NotFoundException('Order not found');
      if (order.status !== 'pending_payment') {
        throw new ConflictException(`Order is not awaiting payment (status: ${order.status})`);
      }
      if (order.paymentMethod !== 'razorpay') {
        throw new BadRequestException(`Order payment method is "${order.paymentMethod}", not "razorpay"`);
      }
      amount = Number(order.total);
      orderRecordId = order.id;
    } else {
      if (!dto.amount || dto.amount <= 0) throw new BadRequestException('amount is required when purpose is "topup"');
      amount = Math.round(dto.amount * 100) / 100;
      const wallet = await this.walletService.getOrCreateWallet(userId);
      walletId = wallet.id;
    }

    const amountPaise = Math.round(amount * 100);

    // One Homekrafted order opens at most one *live* Razorpay order.
    //
    // Without this, every call minted a fresh one: a double-click, a
    // back-button, or a reload of the checkout page left two payable
    // Razorpay orders against the same `Order`. Both are real payment
    // pages. A buyer who paid both was charged twice and credited once —
    // the webhook transitions the `Order` on the first capture, and the
    // second finds it no longer `pending_payment`, so the money lands with
    // nothing to apply it to and no automated way back.
    //
    // Only `purpose: "order"` is de-duplicated. A top-up has no such
    // invariant — two ₹500 top-ups are two legitimate top-ups, and both
    // credit — so collapsing them would silently swallow the second.
    const respond = (razorpayOrderId: string) => ({
      razorpayOrderId,
      amount,
      amountPaise,
      currency: 'INR',
      keyId: this.config.get('razorpay.keyId', { infer: true }),
      mock: razorpayOrderId.startsWith('order_mock_'),
    });

    // Cheap unlocked read first — the ordinary duplicate (a reload, a
    // back-button, a second tab) hits a row that committed seconds ago, so
    // there is nothing to mint and nothing to lock. Only a genuine
    // simultaneous race falls through to the locked path below.
    if (orderRecordId) {
      const open = await this.findOpenOrder(this.prisma, orderRecordId, amount);
      if (open) return respond(open);
    }

    const receipt = `hk_${dto.purpose}_${Date.now()}_${randomUUID().slice(0, 8)}`;

    let razorpayOrderId: string;
    if (this.isMockMode()) {
      razorpayOrderId = `order_mock_${randomUUID()}`;
      this.logger.debug(`Razorpay keys are placeholders — minted mock order ${razorpayOrderId} (₹${amount})`);
    } else {
      const rpOrder = await this.razorpayClient.createOrder({ amountPaise, currency: 'INR', receipt });
      razorpayOrderId = rpOrder.id;
    }

    // Mint *before* the transaction, deliberately. The alternative holds a
    // row lock across an HTTP call to Razorpay, which under load is how a
    // slow third party becomes a database pile-up. The cost is that a lost
    // race abandons one freshly minted Razorpay order — never handed to a
    // client, so never payable, and it expires on Razorpay's side.
    if (orderRecordId) {
      const settled = await this.prisma.$transaction(async (tx) => {
        // `FOR UPDATE` on `Order`, not on `RazorpayOrder`: on the first
        // call there is no `RazorpayOrder` row yet, and a lock has to be
        // taken on something that already exists. Serializing here means
        // the loser blocks until the winner's row is committed, then sees
        // it — which a bare "look, then create if absent" does not, and
        // that first version of this fix is exactly what the concurrency
        // spec below caught still minting two payable orders.
        await tx.$queryRaw`SELECT id FROM "Order" WHERE id = ${orderRecordId} FOR UPDATE`;
        const open = await this.findOpenOrder(tx, orderRecordId, amount);
        if (open) return open;

        await tx.razorpayOrder.create({
          data: { razorpayOrderId, purpose: dto.purpose, amount, userId, orderId: orderRecordId, status: 'created' },
        });
        return razorpayOrderId;
      });
      return respond(settled);
    }

    await this.prisma.razorpayOrder.create({
      data: { razorpayOrderId, purpose: dto.purpose, amount, userId, walletId, status: 'created' },
    });
    return respond(razorpayOrderId);
  }

  /**
   * This order's still-payable Razorpay order, if any.
   *
   * `amount` is re-read from `Order.total` by the caller, so a mismatch
   * means the order changed after the first attempt; that stale Razorpay
   * order is for the wrong money and must never be handed back.
   */
  private async findOpenOrder(
    db: Prisma.TransactionClient | PrismaService,
    orderId: string,
    amount: number,
  ): Promise<string | null> {
    const open = await db.razorpayOrder.findFirst({
      where: { orderId, status: 'created' },
      orderBy: { createdAt: 'desc' },
    });
    return open && Number(open.amount) === amount ? open.razorpayOrderId : null;
  }

  /**
   * Verifies the `X-Razorpay-Signature` HMAC over the **raw** body before
   * touching any state — an invalid signature is rejected `400` with
   * nothing else evaluated. Only acts on `payment.captured`; every other
   * event type is acknowledged (`200`) as a no-op so Razorpay doesn't keep
   * retrying a delivery we simply don't handle.
   *
   * Idempotent by construction: the `WebhookEvent` insert (keyed on
   * `event:paymentId`) and the resulting credit/order-transition all
   * happen inside one `$transaction` — a redelivered event either loses
   * the unique-insert race (caught below, acknowledged as a duplicate,
   * nothing re-applied) or, if it somehow gets past that, finds
   * `RazorpayOrder.status` already `"captured"` and no-ops.
   */
  async handleWebhook(rawBody: Buffer, signature: string | undefined): Promise<{ received: boolean; note?: string }> {
    const secret = this.config.get('razorpay.webhookSecret', { infer: true });
    if (!verifyRazorpaySignature(rawBody, signature, secret)) {
      throw new BadRequestException('Invalid webhook signature');
    }

    let payload: { event?: string; payload?: { payment?: { entity?: { id?: string; order_id?: string } } } };
    try {
      payload = JSON.parse(rawBody.toString('utf8'));
    } catch {
      throw new BadRequestException('Malformed webhook payload');
    }

    const event = payload.event;
    const paymentEntity = payload.payload?.payment?.entity;
    if (event !== 'payment.captured' || !paymentEntity?.id || !paymentEntity?.order_id) {
      return { received: true, note: 'ignored (not a payment.captured event)' };
    }

    const paymentId = paymentEntity.id;
    const razorpayOrderId = paymentEntity.order_id;

    try {
      await this.prisma.$transaction(async (tx) => {
        // Dedup claim first — if this exact (event, payment) was already
        // processed, the unique-index insert below throws and the whole
        // transaction (including anything after it) never runs.
        await tx.webhookEvent.create({
          data: { provider: 'razorpay', eventId: `${event}:${paymentId}`, paymentId },
        });

        const rpOrder = await tx.razorpayOrder.findUnique({ where: { razorpayOrderId } });
        if (!rpOrder || rpOrder.status === 'captured') return;

        if (rpOrder.purpose === 'topup') {
          if (!rpOrder.walletId) return; // defensive — schema invariant, shouldn't happen
          await this.walletService.creditTopupTx(tx, rpOrder.walletId, Number(rpOrder.amount), { razorpayOrderId });
        } else {
          if (!rpOrder.orderId) return; // defensive — schema invariant, shouldn't happen
          await this.ordersService.markPaidByRazorpayTx(tx, rpOrder.orderId);
        }

        await tx.razorpayOrder.update({ where: { id: rpOrder.id }, data: { status: 'captured' } });
      });
    } catch (err) {
      if (isUniqueConstraintError(err)) {
        return { received: true, note: 'duplicate delivery — already processed' };
      }
      throw err;
    }

    return { received: true };
  }
}
