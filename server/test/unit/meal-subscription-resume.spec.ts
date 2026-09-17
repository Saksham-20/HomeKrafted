import { MealSubscriptionsService } from '../../src/meals/meal-subscriptions.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { WalletService } from '../../src/wallet/wallet.service';
import { IdempotencyService } from '../../src/common/idempotency/idempotency.service';
import { AdminSettingsService } from '../../src/admin/settings.service';
import { NotificationsDeliveryService } from '../../src/notifications/notifications-delivery.service';
import { earliestStartDate } from '../../src/meals/meal-brackets';

/**
 * pause() deliberately leaves a locked delivery `status: 'scheduled'`
 * without touching `mealsRemaining` — "a locked date's meal is already
 * being planned... locked rows stay scheduled and still arrive". resume()
 * has to net those survivors out of `mealsRemaining` before generating new
 * dates, or it overbooks the kitchen and orphans the locked row (finding
 * [33]).
 *
 * Netting the *count* is only half of it: `scheduleDates()` still has to be
 * told the locked survivor's own *date* is unavailable, or — when resume()
 * runs before that date has passed, the realistic pause-then-resume-the-
 * same-evening case — it can generate that exact date again. The
 * subsequent `upsert()` then matches the pre-existing locked row instead
 * of creating a fresh one, and a paid-for meal silently vanishes. The
 * scenario below reproduces that collision (finding [Issue 1]).
 *
 * Prisma is stubbed, but `scheduleDates()` itself is the *real* function
 * (imported by the service, not mocked) — the collision this bug produces
 * is in what dates it generates, so a fake would hide it.
 */

const BASE_SUBSCRIPTION = {
  id: 'ms1',
  userId: 'u1',
  planId: 'mp1',
  addressId: 'ad1',
  bracketStart: '12:30',
  daysOfWeek: [0, 1, 2, 3, 4, 5, 6], // every day, so scheduleDates never has to skip
  status: 'paused' as const,
  pricePerMeal: 100 as unknown as number,
  amountPaid: 500 as unknown as number,
  mealsTotal: 5,
  mealsRemaining: 5,
  startDate: new Date('2020-01-01T00:00:00.000Z'),
  endDate: new Date('2020-01-05T00:00:00.000Z'),
  pausedAt: new Date('2020-01-02T00:00:00.000Z'),
  cancelledAt: null,
  createdAt: new Date('2020-01-01T00:00:00.000Z'),
};

const BASE_PLAN = {
  id: 'mp1',
  slug: 'thali',
  vendorId: 'vd1',
  sellerId: 'sl1',
  name: 'Daily Thali',
  description: 'desc',
  mealType: 'lunch',
  slotLabel: null,
  productId: null,
  diet: 'veg',
  pricePerMeal: 100 as unknown as number,
  servingSize: null,
  weeklyMenu: [],
  imagePlaceholder: 'thali',
  imageSrc: null,
  isActive: true,
  moderationStatus: 'active',
  moderationNote: null,
  maxSubscribers: null,
  vendor: {
    id: 'vd1',
    name: 'Test Kitchen',
    profile: null,
    blackouts: [] as { date: Date }[],
  },
};

function buildService(opts: {
  subscription?: Partial<typeof BASE_SUBSCRIPTION>;
  alreadyScheduled: { scheduledFor: Date }[];
}) {
  const subscription = {
    ...BASE_SUBSCRIPTION,
    ...opts.subscription,
    plan: { vendor: BASE_PLAN.vendor },
  };

  const upsertCalls: { scheduledFor: Date }[] = [];
  let updateData: Record<string, unknown> | undefined;

  const tx = {
    mealDelivery: {
      upsert: jest.fn((args: { where: { subscriptionId_scheduledFor: { scheduledFor: Date } } }) => {
        upsertCalls.push({ scheduledFor: args.where.subscriptionId_scheduledFor.scheduledFor });
        return Promise.resolve({});
      }),
    },
    mealSubscription: {
      update: jest.fn((args: { data: Record<string, unknown> }) => {
        updateData = args.data;
        return Promise.resolve({ ...subscription, ...args.data });
      }),
    },
  };

  const prisma = {
    mealSubscription: {
      findFirst: jest.fn().mockResolvedValue(subscription),
    },
    mealPlan: {
      findUniqueOrThrow: jest.fn().mockResolvedValue(BASE_PLAN),
    },
    mealDelivery: {
      findMany: jest.fn().mockResolvedValue(opts.alreadyScheduled),
    },
    $transaction: jest.fn((cb: (tx: unknown) => unknown) => cb(tx)),
  } as unknown as PrismaService;

  const notifications = {
    deliver: jest.fn().mockResolvedValue(undefined),
  } as unknown as NotificationsDeliveryService;

  const service = new MealSubscriptionsService(
    prisma,
    {} as unknown as WalletService,
    {} as unknown as IdempotencyService,
    {} as unknown as AdminSettingsService,
    notifications,
  );

  return { service, prisma, upsertCalls, getUpdateData: () => updateData };
}

describe('MealSubscriptionsService.resume — locked-delivery accounting', () => {
  it('nets a locked survivor out of mealsRemaining rather than overbooking the kitchen', async () => {
    // pause() left one locked delivery `scheduled`; mealsRemaining (5) was
    // never touched for it. resume() must ask for only 4 new dates, not 5.
    const lockedDate = new Date('2019-06-01T00:00:00.000Z'); // well before any freshly generated date
    const { service, upsertCalls, getUpdateData } = buildService({
      subscription: { mealsRemaining: 5 },
      alreadyScheduled: [{ scheduledFor: lockedDate }],
    });

    await service.resume('u1', 'ms1');

    // Exactly mealsRemaining - alreadyScheduled.length = 4 new rows created.
    expect(upsertCalls).toHaveLength(4);
    // The locked survivor is never re-upserted — it was never touched by
    // pause() and resume() must leave it alone too.
    expect(upsertCalls.some((c) => c.scheduledFor.getTime() === lockedDate.getTime())).toBe(false);

    // endDate spans both the locked survivor and the new dates — since the
    // locked date is far in the past relative to the newly scheduled ones,
    // the new endDate is the latest freshly generated date, not the locked one.
    const data = getUpdateData();
    expect(data).toBeDefined();
    const newEndDate = data!.endDate as Date;
    expect(newEndDate.getTime()).toBeGreaterThan(lockedDate.getTime());
  });

  it('never re-claims the locked survivor\'s own date — same-evening pause/resume', async () => {
    // The realistic collision: pause and resume happen the same evening,
    // before the locked survivor's date has passed. `scheduleDates()`
    // called with `startDate = earliestStartDate(now, …)` and every day of
    // the week wanted would otherwise generate that exact date first —
    // it's the *first* date it is allowed to pick. `profile: null` on
    // BASE_PLAN.vendor means resume() computes the same
    // `earliestStartDate(new Date(), undefined)` used here.
    const lockedDate = earliestStartDate(new Date(), undefined);
    const { service, upsertCalls } = buildService({
      subscription: { mealsRemaining: 5 },
      alreadyScheduled: [{ scheduledFor: lockedDate }],
    });

    await service.resume('u1', 'ms1');

    // 5 - 1 locked survivor = 4 freshly scheduled rows.
    expect(upsertCalls).toHaveLength(4);
    // None of them may land back on the date the locked survivor already
    // occupies — that would be the collision the bug produced.
    expect(upsertCalls.some((c) => c.scheduledFor.getTime() === lockedDate.getTime())).toBe(false);

    // The load-bearing assertion: the locked survivor plus every freshly
    // scheduled date, taken together, are `mealsRemaining` **distinct**
    // dates — proving no meal was silently dropped by two rows colliding
    // on the same date.
    const allDates = new Set([
      lockedDate.getTime(),
      ...upsertCalls.map((c) => c.scheduledFor.getTime()),
    ]);
    expect(allDates.size).toBe(5);
  });

  it('reproduces the pre-fix behaviour when nothing survived the pause', async () => {
    const { service, upsertCalls } = buildService({
      subscription: { mealsRemaining: 3 },
      alreadyScheduled: [],
    });

    await service.resume('u1', 'ms1');

    // No locked survivors — every meal owed is freshly scheduled, same as
    // before this fix.
    expect(upsertCalls).toHaveLength(3);
  });

  it('schedules nothing new when every owed meal already has a locked row', async () => {
    const lockedDates = [
      new Date('2019-06-01T00:00:00.000Z'),
      new Date('2019-06-02T00:00:00.000Z'),
    ];
    const { service, upsertCalls, getUpdateData } = buildService({
      subscription: { mealsRemaining: 2 },
      alreadyScheduled: lockedDates.map((scheduledFor) => ({ scheduledFor })),
    });

    await service.resume('u1', 'ms1');

    expect(upsertCalls).toHaveLength(0);
    // endDate falls back to the latest locked survivor.
    const data = getUpdateData();
    expect((data!.endDate as Date).getTime()).toBe(lockedDates[1].getTime());
  });
});
