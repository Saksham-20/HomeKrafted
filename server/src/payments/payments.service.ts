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
    const receipt = `hk_${dto.purpose}_${Date.now()}_${randomUUID().slice(0, 8)}`;

    let razorpayOrderId: string;
    let mock = false;
    if (this.isMockMode()) {
      razorpayOrderId = `order_mock_${randomUUID()}`;
      mock = true;
      this.logger.debug(`Razorpay keys are placeholders — minted mock order ${razorpayOrderId} (₹${amount})`);
    } else {
      const rpOrder = await this.razorpayClient.createOrder({ amountPaise, currency: 'INR', receipt });
      razorpayOrderId = rpOrder.id;
    }

    await this.prisma.razorpayOrder.create({
      data: {
        razorpayOrderId,
        purpose: dto.purpose,
        amount,
        userId,
        orderId: orderRecordId,
        walletId,
        status: 'created',
      },
    });

    return {
      razorpayOrderId,
      amount,
      amountPaise,
      currency: 'INR',
      keyId: this.config.get('razorpay.keyId', { infer: true }),
      mock,
    };
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
