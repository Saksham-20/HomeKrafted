import { MealBlackoutCascadeService } from '../../src/meals/blackout-cascade.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { NotificationsDeliveryService } from '../../src/notifications/notifications-delivery.service';

/**
 * pause() leaves a locked delivery `status: 'scheduled'` on a subscription
 * whose own `status` is `'paused'` by design — "locked rows stay scheduled
 * and still arrive". A blackout added afterward for that exact date must
 * still cascade it (reschedule + notify), or the paused subscriber's meal
 * silently stays `scheduled` for a day the kitchen has marked closed
 * (finding [34]).
 *
 * pause() never lowers `endDate` when it cancels the rest of a cycle's
 * schedule, so on a paused subscriber it is stale — it still reflects the
 * *original* cycle's end, not "the day after everything currently
 * actually scheduled" (the one locked row left standing). Basing the
 * replacement date on that stale `endDate` pushes a paused subscriber's
 * makeup meal out to a far-later date instead of landing right after the
 * blackout — delayed, not lost, but needlessly so (finding [Issue 2]).
 * `findFirst` on `mealDelivery` is stubbed to answer with the one
 * surviving locked row, the same one the `findMany` above already
 * returned — that is what lets the fix read the actual latest scheduled
 * date instead of trusting `endDate`.
 *
 * Prisma is stubbed: what's under test is which subscription statuses the
 * `affected` query includes and which date the replacement basis reads,
 * not `scheduleDates` (covered elsewhere).
 */
function buildService(deliveries: unknown[], latestScheduled: { scheduledFor: Date } | null = null) {
  const updateCalls: unknown[] = [];
  const upsertCalls: unknown[] = [];
  const subscriptionUpdateCalls: unknown[] = [];

  const prisma = {
    mealDelivery: {
      findMany: jest.fn().mockResolvedValue(deliveries),
      findFirst: jest.fn().mockResolvedValue(latestScheduled),
      update: jest.fn((args: unknown) => {
        updateCalls.push(args);
        return Promise.resolve({});
      }),
      upsert: jest.fn((args: unknown) => {
        upsertCalls.push(args);
        return Promise.resolve({});
      }),
    },
    mealSubscription: {
      update: jest.fn((args: unknown) => {
        subscriptionUpdateCalls.push(args);
        return Promise.resolve({});
      }),
    },
    $transaction: jest.fn((cb: (tx: unknown) => unknown) => cb(prisma)),
  } as unknown as PrismaService;

  const notifications = {
    deliver: jest.fn().mockResolvedValue(undefined),
  } as unknown as NotificationsDeliveryService;

  const service = new MealBlackoutCascadeService(prisma, notifications);
  return { service, prisma, updateCalls, upsertCalls, subscriptionUpdateCalls };
}

describe('MealBlackoutCascadeService.applyBlackout — status filter', () => {
  it('asks the database for both active and paused subscriptions, not just active', async () => {
    const { service, prisma } = buildService([]);
    await service.applyBlackout('vd1', new Date('2026-09-20T00:00:00.000Z'), 'Closed');

    const where = (prisma.mealDelivery.findMany as jest.Mock).mock.calls[0][0].where;
    expect(where.subscription.status).toEqual({ in: ['active', 'paused'] });
  });

  it('cascades a paused subscriber whose locked delivery survived pause()', async () => {
    const date = new Date('2026-09-20T00:00:00.000Z');
    const delivery = {
      id: 'del1',
      scheduledFor: date,
      subscription: {
        id: 'ms1',
        userId: 'u1',
        status: 'paused',
        daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
        bracketStart: '12:30',
        endDate: date,
        plan: {
          name: 'Daily Thali',
          vendorId: 'vd1',
          vendor: {
            name: 'Test Kitchen',
            profile: null,
            blackouts: [] as { date: Date }[],
          },
        },
      },
    };

    // `findFirst` answers with the one surviving locked row — the same
    // date the blackout itself hits.
    const { service, updateCalls, upsertCalls, subscriptionUpdateCalls } = buildService(
      [delivery],
      { scheduledFor: date },
    );
    const moved = await service.applyBlackout('vd1', date, 'Closed for a holiday');

    expect(moved).toBe(1);
    // The locked delivery itself is marked unavailable...
    expect(updateCalls).toEqual([
      { where: { id: 'del1' }, data: { status: 'unavailable', reason: 'Closed for a holiday' } },
    ]);
    // ...and a replacement is scheduled, same as an active subscriber gets.
    expect(upsertCalls).toHaveLength(1);
    expect(subscriptionUpdateCalls).toHaveLength(1);
  });

  it('replaces right after the blackout for a paused subscriber, not at a stale endDate', async () => {
    const date = new Date('2026-09-20T00:00:00.000Z');
    // A realistic stale `endDate`: what the FULL pre-pause cycle's end
    // date actually was — weeks past the single locked row still
    // standing. pause() never lowers `endDate` when it cancels the rest
    // of the schedule, so this is exactly what a real paused row carries,
    // not a fixture engineered to make the old (buggy) math happen to
    // land right.
    const staleEndDate = new Date('2026-10-15T00:00:00.000Z');
    const delivery = {
      id: 'del1',
      scheduledFor: date,
      subscription: {
        id: 'ms1',
        userId: 'u1',
        status: 'paused',
        daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
        bracketStart: '12:30',
        endDate: staleEndDate,
        plan: {
          name: 'Daily Thali',
          vendorId: 'vd1',
          vendor: {
            name: 'Test Kitchen',
            profile: null,
            blackouts: [] as { date: Date }[],
          },
        },
      },
    };

    // The blacked-out delivery is the only surviving `scheduled` row —
    // what a real `findFirst(orderBy: scheduledFor desc)` would answer.
    const { service, upsertCalls, subscriptionUpdateCalls } = buildService([delivery], {
      scheduledFor: date,
    });
    await service.applyBlackout('vd1', date, 'Closed for a holiday');

    // The load-bearing assertion: the replacement lands the day right
    // after the blackout (2026-09-21), not after the stale endDate a
    // month later.
    const upsertArgs = upsertCalls[0] as { create: { scheduledFor: Date } };
    const replacementDate = upsertArgs.create.scheduledFor;
    expect(replacementDate.toISOString().slice(0, 10)).toBe('2026-09-21');
    expect(replacementDate.getTime()).toBeLessThan(staleEndDate.getTime());

    // And the subscription's own `endDate` moves to that near date, not
    // toward (or staying at) the stale one.
    const subUpdate = subscriptionUpdateCalls[0] as { data: { endDate: Date } };
    expect(subUpdate.data.endDate.toISOString().slice(0, 10)).toBe('2026-09-21');
  });
});
