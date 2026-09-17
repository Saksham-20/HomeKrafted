import { ConflictException } from '@nestjs/common';
import { AdminOrdersService } from '../../src/admin/orders.service';

/**
 * `overrideStatus`'s compare-and-set was a read-then-write, not an atomic
 * one — finding [21]. `assertExpectedStatus` only compared against
 * whatever the *client's* stale option list claimed; the write itself was
 * a plain `update({ where: { id } })` with no re-check of `status`, so two
 * admins racing the same order (or one admin double-clicking a slow
 * network) could both pass the read, both write, and both notify the
 * buyer — the second one silently clobbering the first.
 *
 * The fix makes the write itself the compare-and-set — `updateMany({
 * where: { id, status: existing.status } })`, checked for `count === 1` —
 * the same shape `AdminRidersService`'s status transitions already use.
 */

function fakeOrder(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'ord-1',
    orderNumber: 'HK-1001',
    userId: 'user-1',
    status: 'confirmed',
    items: [],
    shippingAddressIds: [],
    shipments: [],
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

function serviceWith(options: { updateManyCount: number; currentStatus?: string }) {
  const notifySpy = jest.fn();
  const auditSpy = jest.fn().mockResolvedValue(undefined);

  const prisma = {
    order: {
      findUnique: jest.fn().mockResolvedValue(fakeOrder({ status: options.currentStatus ?? 'confirmed' })),
      updateMany: jest.fn().mockResolvedValue({ count: options.updateManyCount }),
      findUniqueOrThrow: jest.fn().mockResolvedValue(fakeOrder({ status: 'packed' })),
    },
  };

  const service = new AdminOrdersService(
    prisma as never,
    {} as never,
    {} as never,
    {} as never,
    { log: auditSpy } as never,
    { notifyBuyerOfStatus: notifySpy } as never,
  );
  return { service, prisma, notifySpy, auditSpy };
}

function fakeLaundryBooking(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'bk-1',
    status: 'scheduled',
    ...overrides,
  };
}

function fakeSnackOrder(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'sk-1',
    status: 'received',
    ...overrides,
  };
}

/** Same shape as `serviceWith`, scoped to the `laundryBooking` table the laundry branch reads and writes. */
function serviceWithLaundry(options: { updateManyCount: number; currentStatus?: string }) {
  const auditSpy = jest.fn().mockResolvedValue(undefined);

  const prisma = {
    laundryBooking: {
      findUnique: jest.fn().mockResolvedValue(fakeLaundryBooking({ status: options.currentStatus ?? 'scheduled' })),
      updateMany: jest.fn().mockResolvedValue({ count: options.updateManyCount }),
      findUniqueOrThrow: jest.fn().mockResolvedValue(fakeLaundryBooking({ status: 'picked_up' })),
    },
  };

  const service = new AdminOrdersService(
    prisma as never,
    {} as never,
    {} as never,
    {} as never,
    { log: auditSpy } as never,
    {} as never,
  );
  return { service, prisma, auditSpy };
}

/** Same shape as `serviceWith`, scoped to the `snackOrder` table the snack branch reads and writes. */
function serviceWithSnack(options: { updateManyCount: number; currentStatus?: string }) {
  const auditSpy = jest.fn().mockResolvedValue(undefined);

  const prisma = {
    snackOrder: {
      findUnique: jest.fn().mockResolvedValue(fakeSnackOrder({ status: options.currentStatus ?? 'received' })),
      updateMany: jest.fn().mockResolvedValue({ count: options.updateManyCount }),
      findUniqueOrThrow: jest.fn().mockResolvedValue(fakeSnackOrder({ status: 'accepted' })),
    },
  };

  const service = new AdminOrdersService(
    prisma as never,
    {} as never,
    {} as never,
    {} as never,
    { log: auditSpy } as never,
    {} as never,
  );
  return { service, prisma, auditSpy };
}

describe('AdminOrdersService.overrideStatus — the read-then-write race', () => {
  it('refuses with a 409 when the row changed between the read and the write, instead of overwriting it', async () => {
    const { service, prisma, notifySpy, auditSpy } = serviceWith({ updateManyCount: 0 });

    await expect(
      service.overrideStatus('admin-1', 'marketplace', 'ord-1', 'packed'),
    ).rejects.toBeInstanceOf(ConflictException);

    // The write itself re-checks status — a plain `update({ where: { id } })`
    // would not have needed the current status in its `where` at all.
    expect(prisma.order.updateMany).toHaveBeenCalledWith({
      where: { id: 'ord-1', status: 'confirmed' },
      data: { status: 'packed' },
    });
    // Nobody is told about a status change that never actually landed.
    expect(notifySpy).not.toHaveBeenCalled();
    expect(auditSpy).not.toHaveBeenCalled();
  });

  it('writes and notifies once when the compare-and-set succeeds', async () => {
    const { service, notifySpy, auditSpy } = serviceWith({ updateManyCount: 1 });

    const result = await service.overrideStatus('admin-1', 'marketplace', 'ord-1', 'packed');

    expect(result.status).toBe('packed');
    expect(notifySpy).toHaveBeenCalledWith('ord-1', 'packed');
    expect(auditSpy).toHaveBeenCalled();
  });

  // The identical compare-and-set was applied to the laundry and snack
  // branches alongside the marketplace one — same `updateMany({ where: {
  // id, status: existing.status } })`, same `count !== 1` check — so the
  // race is refused identically on all three, not only the one exercised
  // above.
  it('refuses with a 409 on the laundry branch when the row changed between the read and the write', async () => {
    const { service, prisma, auditSpy } = serviceWithLaundry({ updateManyCount: 0 });

    await expect(
      service.overrideStatus('admin-1', 'laundry', 'bk-1', 'picked-up'),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(prisma.laundryBooking.updateMany).toHaveBeenCalledWith({
      where: { id: 'bk-1', status: 'scheduled' },
      data: { status: 'picked_up' },
    });
    expect(auditSpy).not.toHaveBeenCalled();
  });

  it('refuses with a 409 on the snack branch when the row changed between the read and the write', async () => {
    const { service, prisma, auditSpy } = serviceWithSnack({ updateManyCount: 0 });

    await expect(
      service.overrideStatus('admin-1', 'snack', 'sk-1', 'accepted'),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(prisma.snackOrder.updateMany).toHaveBeenCalledWith({
      where: { id: 'sk-1', status: 'received' },
      data: { status: 'accepted' },
    });
    expect(auditSpy).not.toHaveBeenCalled();
  });
});
