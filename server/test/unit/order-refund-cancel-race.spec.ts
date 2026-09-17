import { OrdersService } from '../../src/orders/orders.service';

/**
 * `cancelOrder` (finding [9]) and `refundOrder` (finding [26]) each read
 * `Order.status`/`refundStatus` on a plain, unlocked `findUnique` before
 * deciding whether to move money. Under Postgres's default READ COMMITTED
 * isolation two concurrent calls for the same order — a double-tap before
 * a button disables, or a retried request — can both pass that read and
 * both restock/credit/reverse-cashback. The fix takes `SELECT ... FOR
 * UPDATE` on the `Order` row *before* reading it, the same
 * lock-then-read-fresh shape `PaymentsService.createOrder` and
 * `ShippingService.reconcileOrderStatus` already use: the loser blocks
 * until the winner commits, then reads the already-settled row and no-ops.
 *
 * `refundOrder` also never reversed the cashback earned at placement
 * (finding [25]) — `cancelOrder` does, with the exact reasoning repeated
 * here: crediting the full total back while leaving the cashback credit
 * in place pays out on an order being taken back.
 */

function fakeOrder(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'ord-1',
    orderNumber: 'HK-1001',
    userId: 'user-1',
    status: 'confirmed',
    items: [] as { sku?: string; quantity?: number }[],
    shipments: [],
    shippingAddressIds: [],
    giftIsGift: false,
    giftRecipientName: null,
    giftRecipientAddressId: null,
    giftHidePrice: false,
    giftMessage: null,
    placedAt: new Date('2026-09-01T00:00:00Z'),
    subtotal: 100,
    shippingFee: 0,
    total: 100,
    walletApplied: 0,
    cashbackEarned: 0,
    refundStatus: 'none',
    refundReason: null,
    refundRequestedAt: null,
    cancelledAt: null,
    deliveredAt: null,
    paymentMethod: 'razorpay',
    ...overrides,
  };
}

function walletStub() {
  const postLedgerEntryTx = jest.fn().mockResolvedValue({ balanceAfter: 0, transactionId: 'tx1' });
  const getOrCreateWalletTx = jest.fn().mockResolvedValue({ id: 'w1' });
  return { walletService: { postLedgerEntryTx, getOrCreateWalletTx }, postLedgerEntryTx };
}

function buildService(deps: {
  prisma?: Record<string, unknown>;
  walletService?: Record<string, unknown>;
  idempotency?: Record<string, unknown>;
  orderNotifications?: Record<string, unknown>;
  auditLog?: Record<string, unknown>;
}) {
  return new OrdersService(
    (deps.prisma ?? {}) as never,
    (deps.walletService ?? {}) as never,
    (deps.idempotency ?? {}) as never,
    {} as never,
    {} as never,
    (deps.orderNotifications ?? { notifyBuyerOfStatus: jest.fn(), notifyHomeKraftersOfCancellation: jest.fn(), notifyBuyerOfRefund: jest.fn() }) as never,
    (deps.auditLog ?? { log: jest.fn().mockResolvedValue(undefined) }) as never,
    {} as never,
  );
}

describe('OrdersService#cancelOrder — locked against a concurrent cancel', () => {
  it('locks the order row before reading it', async () => {
    const order = fakeOrder({ status: 'confirmed' });
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue(undefined),
      order: { findUnique: jest.fn().mockResolvedValue(order), update: jest.fn().mockResolvedValue({ ...order, status: 'cancelled' }) },
      weightOption: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    };
    const prisma = { $transaction: jest.fn().mockImplementation((fn: (t: unknown) => unknown) => fn(tx)) };
    const { walletService } = walletStub();
    const service = buildService({ prisma, walletService });

    await service.cancelOrder('user-1', 'ord-1');

    expect(tx.$queryRaw).toHaveBeenCalled();
    expect(tx.order.findUnique).toHaveBeenCalled();
  });

  it('does not restock or refund twice when a concurrent call already committed the cancel', async () => {
    // The locked re-read sees the row a concurrent transaction already
    // committed to `cancelled` while this call was blocked on the lock.
    const order = fakeOrder({ status: 'cancelled' });
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue(undefined),
      order: { findUnique: jest.fn().mockResolvedValue(order), update: jest.fn() },
      weightOption: { updateMany: jest.fn() },
    };
    const prisma = { $transaction: jest.fn().mockImplementation((fn: (t: unknown) => unknown) => fn(tx)) };
    const { walletService, postLedgerEntryTx } = walletStub();
    const orderNotifications = { notifyBuyerOfStatus: jest.fn(), notifyHomeKraftersOfCancellation: jest.fn() };
    const service = buildService({ prisma, walletService, orderNotifications });

    const result = await service.cancelOrder('user-1', 'ord-1');

    expect(result.status).toBe('cancelled');
    expect(tx.weightOption.updateMany).not.toHaveBeenCalled();
    expect(postLedgerEntryTx).not.toHaveBeenCalled();
    expect(tx.order.update).not.toHaveBeenCalled();
    expect(orderNotifications.notifyBuyerOfStatus).not.toHaveBeenCalled();
  });

  it('still restocks, refunds and reverses cashback when nothing raced', async () => {
    const order = fakeOrder({
      status: 'confirmed',
      total: 200,
      cashbackEarned: 10,
      items: [{ sku: 'sku-1', quantity: 2 }],
    });
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue(undefined),
      order: { findUnique: jest.fn().mockResolvedValue(order), update: jest.fn().mockResolvedValue({ ...order, status: 'cancelled' }) },
      weightOption: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    };
    const prisma = { $transaction: jest.fn().mockImplementation((fn: (t: unknown) => unknown) => fn(tx)) };
    const { walletService, postLedgerEntryTx } = walletStub();
    const orderNotifications = { notifyBuyerOfStatus: jest.fn(), notifyHomeKraftersOfCancellation: jest.fn() };
    const service = buildService({ prisma, walletService, orderNotifications });

    await service.cancelOrder('user-1', 'ord-1');

    expect(tx.weightOption.updateMany).toHaveBeenCalledWith({
      where: { sku: 'sku-1' },
      data: { stock: { increment: 2 } },
    });
    expect(postLedgerEntryTx).toHaveBeenCalledWith(tx, expect.objectContaining({ category: 'refund', amount: 200 }));
    expect(postLedgerEntryTx).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ category: 'cashback', direction: 'debit', amount: 10, lifetimeSavedDelta: -10 }),
    );
    expect(orderNotifications.notifyBuyerOfStatus).toHaveBeenCalledWith('ord-1', 'cancelled');
  });
});

describe('OrdersService#refundOrder — locked against a concurrent refund (finding [26]), and cashback reversal (finding [25])', () => {
  function idempotencyRunningOn(tx: unknown) {
    return { run: jest.fn().mockImplementation((_u: string, _s: string, _k: string | undefined, work: (t: unknown) => unknown) => work(tx)) };
  }

  it('locks the order row before reading it', async () => {
    const order = fakeOrder({ status: 'delivered', refundStatus: 'none', total: 150 });
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue(undefined),
      order: { findUnique: jest.fn().mockResolvedValue(order), update: jest.fn().mockResolvedValue({ ...order, refundStatus: 'refunded' }) },
    };
    const { walletService } = walletStub();
    const service = buildService({ walletService, idempotency: idempotencyRunningOn(tx) });

    await service.refundOrder('admin-1', 'ord-1');

    expect(tx.$queryRaw).toHaveBeenCalled();
    expect(tx.order.findUnique).toHaveBeenCalled();
  });

  it('does not double-credit when a concurrent call already committed the refund', async () => {
    const order = fakeOrder({ status: 'delivered', refundStatus: 'refunded', total: 150 });
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue(undefined),
      order: {
        findUnique: jest.fn().mockResolvedValue(order),
        findUniqueOrThrow: jest.fn().mockResolvedValue(order),
        update: jest.fn(),
      },
    };
    const { walletService, postLedgerEntryTx } = walletStub();
    const auditLog = { log: jest.fn() };
    const orderNotifications = { notifyBuyerOfRefund: jest.fn() };
    const service = buildService({ walletService, idempotency: idempotencyRunningOn(tx), auditLog, orderNotifications });

    const result = await service.refundOrder('admin-1', 'ord-1');

    expect(result.refundStatus).toBe('refunded');
    expect(postLedgerEntryTx).not.toHaveBeenCalled();
    expect(tx.order.update).not.toHaveBeenCalled();
    expect(auditLog.log).not.toHaveBeenCalled();
    expect(orderNotifications.notifyBuyerOfRefund).not.toHaveBeenCalled();
  });

  it('reverses the cashback earned at placement, mirroring cancelOrder', async () => {
    const order = fakeOrder({ status: 'delivered', refundStatus: 'none', total: 200, cashbackEarned: 15 });
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue(undefined),
      order: { findUnique: jest.fn().mockResolvedValue(order), update: jest.fn().mockResolvedValue({ ...order, refundStatus: 'refunded' }) },
    };
    const { walletService, postLedgerEntryTx } = walletStub();
    const service = buildService({ walletService, idempotency: idempotencyRunningOn(tx) });

    await service.refundOrder('admin-1', 'ord-1');

    expect(postLedgerEntryTx).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ category: 'refund', direction: 'credit', amount: 200 }),
    );
    expect(postLedgerEntryTx).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        category: 'cashback',
        direction: 'debit',
        amount: 15,
        lifetimeSavedDelta: -15,
        skipAutoTopupCheck: true,
      }),
    );
  });

  it('does not touch cashback when none was earned', async () => {
    const order = fakeOrder({ status: 'delivered', refundStatus: 'none', total: 200, cashbackEarned: 0 });
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue(undefined),
      order: { findUnique: jest.fn().mockResolvedValue(order), update: jest.fn().mockResolvedValue({ ...order, refundStatus: 'refunded' }) },
    };
    const { walletService, postLedgerEntryTx } = walletStub();
    const service = buildService({ walletService, idempotency: idempotencyRunningOn(tx) });

    await service.refundOrder('admin-1', 'ord-1');

    expect(postLedgerEntryTx).toHaveBeenCalledTimes(1);
    expect(postLedgerEntryTx).toHaveBeenCalledWith(tx, expect.objectContaining({ category: 'refund' }));
  });
});
