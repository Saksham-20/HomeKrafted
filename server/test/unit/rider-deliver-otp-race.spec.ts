import { BadRequestException, ConflictException } from '@nestjs/common';
import { RiderJobsService } from '../../src/rider/rider-jobs.service';
import { LOCKED_SENTENCE, MAX_OTP_ATTEMPTS } from '../../src/rider/otp-lock';

/**
 * `deliver()`'s OTP-attempt ceiling is enforced under `FOR UPDATE`
 * (`server/src/rider/rider-jobs.service.ts`), not against the stale
 * `ownJob()` read at the top of the request — otherwise concurrent
 * `/deliver` calls each pass the lock check against the same pre-race
 * `otpAttempts` and all get to compare a guess before any sibling's
 * increment lands, turning the 5-guess ceiling into "5 guesses per wave
 * of concurrent requests".
 *
 * These tests stand in for that race by having the row locked inside the
 * transaction return a *different* `otpAttempts`/`failureReason` than the
 * outer `ownJob()` read did — exactly what a sibling request committing
 * in between would produce — and assert the transaction's own fresh read
 * decides the outcome.
 */

const RIDER = { id: 'ri1' };
const USER = { userId: 'u1', role: 'rider' as const };

function jobRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'job1',
    riderId: 'ri1',
    status: 'at_drop',
    orderId: 'ord1',
    jobNumber: 'JOB-1',
    codAmount: null,
    deliveryOtp: '1234',
    otpAttempts: 0,
    failureReason: null as string | null,
    ...overrides,
  };
}

function serviceWith(opts: { outerJob: ReturnType<typeof jobRow>; txCurrent: ReturnType<typeof jobRow> }) {
  const txUpdate = jest.fn().mockImplementation((args) => ({ ...opts.txCurrent, ...args.data }));
  const tx = {
    $queryRaw: jest.fn().mockResolvedValue(undefined),
    deliveryJob: {
      findUniqueOrThrow: jest.fn().mockResolvedValue(opts.txCurrent),
      update: txUpdate,
    },
  };
  const prisma = {
    deliveryJob: {
      findUnique: jest.fn().mockResolvedValue(opts.outerJob),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      findFirst: jest.fn().mockResolvedValue(null),
    },
    deliveryProof: { findFirst: jest.fn().mockResolvedValue({ id: 'proof1' }) },
    riderCashEntry: { create: jest.fn() },
    $transaction: jest.fn().mockImplementation(async (cb: (tx: unknown) => unknown) => cb(tx)),
  };
  const riders = { resolveRider: jest.fn().mockResolvedValue(RIDER) };
  const reconcile = { reconcile: jest.fn().mockResolvedValue(undefined) };
  const service = new RiderJobsService(
    prisma as never,
    riders as never,
    {} as never,
    {} as never,
    reconcile as never,
  );
  return { service, prisma, tx, txUpdate, reconcile };
}

describe('RiderJobsService.deliver — OTP attempt race', () => {
  it('locks on the transaction’s fresh read even when the outer read was not locked yet', async () => {
    // Outer `ownJob()` read: not locked. A sibling request has since
    // pushed the row to the ceiling and set the lock sentence — the `tx`
    // read (under FOR UPDATE) sees that, the stale outer read does not.
    const { service, tx, txUpdate } = serviceWith({
      outerJob: jobRow({ otpAttempts: 0, failureReason: null }),
      txCurrent: jobRow({ otpAttempts: MAX_OTP_ATTEMPTS, failureReason: LOCKED_SENTENCE }),
    });

    const promise = service.deliver(USER, 'job1', { otp: '0000' });
    await expect(promise).rejects.toBeInstanceOf(ConflictException);
    await expect(promise).rejects.toThrow(LOCKED_SENTENCE);

    // Nothing further is written — an already-locked row takes no new attempt.
    expect(txUpdate).not.toHaveBeenCalled();
    expect(tx.$queryRaw).toHaveBeenCalled();
  });

  it('increments exactly once per call and locks precisely at the ceiling', async () => {
    const { service, txUpdate } = serviceWith({
      outerJob: jobRow({ otpAttempts: MAX_OTP_ATTEMPTS - 2 }),
      // The row FOR UPDATE saw one more prior attempt than the outer read
      // did (a sibling request committed in between).
      txCurrent: jobRow({ otpAttempts: MAX_OTP_ATTEMPTS - 1 }),
    });

    const promise = service.deliver(USER, 'job1', { otp: 'wrong' });
    await expect(promise).rejects.toBeInstanceOf(ConflictException);
    await expect(promise).rejects.toThrow(LOCKED_SENTENCE);

    expect(txUpdate).toHaveBeenCalledTimes(1);
    expect(txUpdate).toHaveBeenCalledWith({
      where: { id: 'job1' },
      data: { otpAttempts: MAX_OTP_ATTEMPTS, failureReason: LOCKED_SENTENCE },
    });
  });

  it('reports the remaining attempts from the transaction’s count, not the stale outer one', async () => {
    const { service, txUpdate } = serviceWith({
      outerJob: jobRow({ otpAttempts: 0 }),
      txCurrent: jobRow({ otpAttempts: 2 }),
    });

    const promise = service.deliver(USER, 'job1', { otp: 'wrong' });
    await expect(promise).rejects.toBeInstanceOf(BadRequestException);
    await expect(promise).rejects.toThrow(`${MAX_OTP_ATTEMPTS - 3} attempts left`);
    expect(txUpdate).toHaveBeenCalledTimes(1);
    expect(txUpdate).toHaveBeenCalledWith({ where: { id: 'job1' }, data: { otpAttempts: 3 } });
  });

  it('a correct guess clears the transaction without writing an attempt', async () => {
    const { service, prisma, txUpdate } = serviceWith({
      outerJob: jobRow({ otpAttempts: 1 }),
      txCurrent: jobRow({ otpAttempts: 1, deliveryOtp: '1234' }),
    });
    // `active()` re-fetches and maps a job with its full relations —
    // irrelevant to the OTP race this spec pins, so it's stubbed rather
    // than hand-building a `JOB_WITH_RELATIONS_INCLUDE`-shaped fixture.
    jest.spyOn(service, 'active').mockResolvedValue(null);

    await service.deliver(USER, 'job1', { otp: '1234' });

    expect(txUpdate).not.toHaveBeenCalled();
    expect(prisma.deliveryJob.updateMany).toHaveBeenCalledWith({
      where: { id: 'job1', status: 'at_drop' },
      data: expect.objectContaining({ status: 'delivered' }),
    });
  });
});
