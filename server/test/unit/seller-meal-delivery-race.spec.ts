import { ConflictException, NotFoundException } from '@nestjs/common';
import { SellerMealPlansService } from '../../src/seller/meal-plans.service';

/**
 * `markDelivered` used to check the delivery's status with a plain read
 * *before* opening its transaction, so two near-simultaneous "mark
 * delivered" taps (a double-tap on the portal control, or a retried
 * request) could both pass the check and each independently decrement
 * `mealsRemaining` — double-charging a buyer's prepaid meal balance for
 * one delivery event.
 *
 * The fix moves the status check inside the transaction as an atomic
 * `updateMany({ where: { id, status: 'scheduled' } })`, the same
 * compare-and-set shape `AdminPayoutsService#claimPending` and
 * `RiderJobsService`'s job-status transitions already use: `status` rides
 * in the WHERE clause, so Postgres evaluates it against the row it locks
 * and exactly one of two racing callers matches. The loser gets a 409 and
 * never touches `mealsRemaining`.
 */

function serviceWith(opts: { updateManyCount: number; deliveryStatusAfterLoss?: string; mealsRemainingAfter?: number }) {
  const tx = {
    mealDelivery: {
      updateMany: jest.fn().mockResolvedValue({ count: opts.updateManyCount }),
      findUniqueOrThrow: jest
        .fn()
        .mockResolvedValue({ id: 'd1', status: opts.deliveryStatusAfterLoss ?? 'delivered' }),
    },
    mealSubscription: {
      update: jest.fn().mockResolvedValue({ id: 'sub1', mealsRemaining: opts.mealsRemainingAfter ?? 5 }),
      findUniqueOrThrow: jest
        .fn()
        .mockResolvedValue({ id: 'sub1', mealsRemaining: opts.mealsRemainingAfter ?? 5 }),
    },
  };
  const prisma = {
    mealDelivery: {
      findFirst: jest
        .fn()
        .mockResolvedValue({ id: 'd1', subscriptionId: 'sub1', status: 'scheduled', subscription: {} }),
    },
    $transaction: jest.fn().mockImplementation((fn: (t: unknown) => unknown) => fn(tx)),
  };
  const service = new SellerMealPlansService(prisma as never);
  return { service, tx, prisma };
}

describe('SellerMealPlansService#markDelivered — race safety', () => {
  it('decrements mealsRemaining exactly once when the atomic update wins', async () => {
    const { service, tx } = serviceWith({ updateManyCount: 1 });

    const result = await service.markDelivered('se1', 'd1');

    expect(result).toEqual({ ok: true });
    expect(tx.mealDelivery.updateMany).toHaveBeenCalledWith({
      where: { id: 'd1', status: 'scheduled' },
      data: expect.objectContaining({ status: 'delivered' }),
    });
    expect(tx.mealSubscription.update).toHaveBeenCalledTimes(1);
    expect(tx.mealSubscription.update).toHaveBeenCalledWith({
      where: { id: 'sub1' },
      data: { mealsRemaining: { decrement: 1 } },
    });
  });

  it('refuses with a conflict, and never decrements, when a second racing call loses', async () => {
    const { service, tx } = serviceWith({ updateManyCount: 0, deliveryStatusAfterLoss: 'delivered' });

    await expect(service.markDelivered('se1', 'd1')).rejects.toThrow(ConflictException);
    expect(tx.mealSubscription.update).not.toHaveBeenCalled();
  });

  it('404s when the delivery does not belong to this seller', async () => {
    const { service, prisma } = serviceWith({ updateManyCount: 1 });
    prisma.mealDelivery.findFirst.mockResolvedValueOnce(null);

    await expect(service.markDelivered('se1', 'missing')).rejects.toThrow(NotFoundException);
  });
});
