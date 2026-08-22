import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { WalletService } from '../wallet/wallet.service';
import { IdempotencyService } from '../common/idempotency/idempotency.service';
import { CreateMealSubscriptionDto, MEAL_COUNTS } from './dto/create-meal-subscription.dto';
import {
  earliestStartDate,
  isBracketAllowed,
  MealTypeKey,
  scheduleDates,
  toDateKey,
} from './meal-brackets';
import { DeliveryDayContext, mapMealSubscription } from './meals.mapper';
import { AdminSettingsService } from '../admin/settings.service';
import { NotificationsDeliveryService } from '../notifications/notifications-delivery.service';
import { templateLineFor } from './day-menus.service';
import { isMenuLocked } from './menu-lock';

/** Rounds money the same way the wallet ledger does. */
function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Meal subscriptions — owner-scoped, prepaid, wallet-paid.
 *
 * **A cycle is paid for up front, in one debit, and nothing charges anybody
 * in the background.** That is not a simplification, it is the only honest
 * design available: there is no saved card and no recurring mandate. The
 * milestone this ships in opened by deleting a code path that credited
 * wallet balance with no payment behind it, and a daily auto-charge on top
 * of that infrastructure would be the same mistake pointed the other way.
 *
 * The failure mode the prepaid model avoids is the one that matters most on
 * a daily-food product: "lunch didn't arrive because you were ₹20 short".
 * When UPI AutoPay is wired, `amountPaid` + `mealsRemaining` is the seam to
 * convert against.
 */
@Injectable()
export class MealSubscriptionsService {
  private readonly logger = new Logger(MealSubscriptionsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly wallet: WalletService,
    private readonly idempotency: IdempotencyService,
    private readonly settings: AdminSettingsService,
    private readonly notifications: NotificationsDeliveryService,
  ) {}

  /**
   * Everything a delivery row needs to say what food arrives and whether
   * it can still be changed (M37): set day menus win, a 7-line
   * `weeklyMenu` falls back per weekday, and lock state comes from the
   * platform's `menuLockTime` — computed here once so the client ships
   * booleans instead of re-deriving "locked" against its own clock (the
   * M12 hydration lesson).
   */
  private async dayContext(
    planId: string,
    weeklyMenu: string[],
    deliveryDates: Date[],
  ): Promise<DeliveryDayContext> {
    const { menuLockTime } = await this.settings.get();
    const now = new Date();
    const dishByDate = new Map<string, string>();
    if (deliveryDates.length > 0) {
      const min = new Date(Math.min(...deliveryDates.map((d) => d.getTime())));
      const max = new Date(Math.max(...deliveryDates.map((d) => d.getTime())));
      const rows = await this.prisma.mealPlanDayMenu.findMany({
        where: { planId, date: { gte: min, lte: max } },
      });
      for (const row of rows) {
        dishByDate.set(row.date.toISOString().slice(0, 10), row.lines.join(', '));
      }
    }
    return {
      dishFor: (date) =>
        dishByDate.get(date.toISOString().slice(0, 10)) ??
        templateLineFor(weeklyMenu, date) ??
        undefined,
      lockedFor: (date) => isMenuLocked(date, menuLockTime, now),
    };
  }

  /** Lifecycle messages ride the `meals` category (M37); a failed message never undoes the write it describes. */
  private tell(userId: string, title: string, body: string, refId: string): void {
    void this.notifications
      .deliver({ userId, category: 'meals', title, body, refType: 'mealSubscription', refId })
      .catch(() => undefined);
  }

  async create(userId: string, dto: CreateMealSubscriptionDto, idempotencyKey?: string) {
    if (!MEAL_COUNTS.includes(dto.mealCount as (typeof MEAL_COUNTS)[number])) {
      throw new BadRequestException(
        `mealCount must be one of ${MEAL_COUNTS.join(', ')} — those are the cycles kitchens commit to.`,
      );
    }

    return this.idempotency.run(userId, 'meals.subscribe', idempotencyKey, async (tx) => {
      const plan = await tx.mealPlan.findUnique({
        where: { id: dto.planId },
        include: { vendor: { include: { profile: true, blackouts: true } } },
      });
      if (!plan || !plan.isActive || plan.moderationStatus !== 'active') {
        throw new NotFoundException('Meal plan not found');
      }

      // The address must be the caller's. Reading it by id alone would let
      // anyone subscribe a meal to a stranger's front door.
      const address = await tx.address.findFirst({
        where: { id: dto.addressId, userId },
      });
      if (!address) {
        throw new NotFoundException('Address not found');
      }

      const profile = plan.vendor.profile;

      if (
        !isBracketAllowed(dto.bracketStart, plan.mealType as MealTypeKey | null, {
          opensAt: profile?.opensAt,
          closesAt: profile?.closesAt,
        })
      ) {
        throw new BadRequestException(
          // `mealType` is optional now, so the message cannot assume one.
          // "does not deliver null at 20:00" is the kind of copy that ships
          // when a field quietly becomes nullable.
          `${plan.vendor.name} does not deliver ${plan.mealType ?? plan.slotLabel ?? 'this plan'} at ${dto.bracketStart}. Pick one of the offered windows.`,
        );
      }

      // Capacity, enforced. `VendorProfile.capacityPerDay` has existed since
      // M16 and is checked nowhere; this is the first place a home cook's
      // stated ceiling actually holds.
      //
      // The plan row is locked first (M37): a transaction alone does not
      // serialise count-then-insert under READ COMMITTED — two concurrent
      // subscribers both count, both see a free seat, both insert. The
      // loser of the lock blocks here and re-counts after the winner
      // commits. Same pattern as `seller/payouts.service.ts` and
      // `wallet.service.ts#postLedgerEntryTx`.
      if (plan.maxSubscribers !== null) {
        await tx.$queryRaw`SELECT "id" FROM "MealPlan" WHERE "id" = ${plan.id} FOR UPDATE`;
        const taken = await tx.mealSubscription.count({
          where: { planId: plan.id, status: { in: ['active', 'paused'] } },
        });
        if (taken >= plan.maxSubscribers) {
          throw new ConflictException(
            `${plan.name} is full. ${plan.vendor.name} is taking ${plan.maxSubscribers} subscribers at a time.`,
          );
        }
      }

      const startDate = earliestStartDate(new Date(), profile?.prepTimeMins);
      const dates = scheduleDates(startDate, dto.daysOfWeek, dto.mealCount, {
        workingDays: profile?.workingDays ?? [],
        blackoutDates: plan.vendor.blackouts.map((b) => b.date),
        prepTimeMins: profile?.prepTimeMins,
      });

      // Fewer dates than meals means the day selection can never be filled —
      // Sundays only, from a kitchen that never works Sundays. Refuse rather
      // than sell a short cycle nobody noticed was short.
      if (dates.length < dto.mealCount) {
        throw new BadRequestException(
          `${plan.vendor.name} cannot fit ${dto.mealCount} meals on the days you picked. Try adding a day.`,
        );
      }

      const pricePerMeal = Number(plan.pricePerMeal);
      const amount = round2(pricePerMeal * dto.mealCount);

      const subscription = await tx.mealSubscription.create({
        data: {
          userId,
          planId: plan.id,
          addressId: address.id,
          bracketStart: dto.bracketStart,
          daysOfWeek: dto.daysOfWeek,
          // Snapshot. Never re-read from the plan: a price rise must reach
          // the buyer at renewal, where they can see it, not silently in the
          // middle of a cycle they already paid for.
          pricePerMeal,
          amountPaid: amount,
          mealsTotal: dto.mealCount,
          mealsRemaining: dto.mealCount,
          startDate: dates[0],
          endDate: dates[dates.length - 1],
        },
      });

      await tx.mealDelivery.createMany({
        data: dates.map((date) => ({
          subscriptionId: subscription.id,
          scheduledFor: date,
          bracketStart: dto.bracketStart,
        })),
      });

      // Money last, inside the same transaction: an insufficient balance
      // throws and takes the subscription and its deliveries with it. There
      // is no state in which somebody has a schedule they did not pay for.
      const wallet = await this.wallet.getOrCreateWalletTx(tx, userId);
      await this.wallet.postLedgerEntryTx(tx, {
        walletId: wallet.id,
        direction: 'debit',
        category: 'payment',
        amount,
        title: `${plan.name} — ${dto.mealCount} meals`,
        refType: 'mealSubscription',
        refId: subscription.id,
      });

      const deliveries = await tx.mealDelivery.findMany({
        where: { subscriptionId: subscription.id },
        orderBy: { scheduledFor: 'asc' },
      });

      // Inside the work callback, never after `run` returns, so a
      // *replayed* idempotency key hands back the stored result without
      // messaging anybody twice (the same placement OrdersService uses).
      this.tell(
        userId,
        'Your meal plan is set',
        `${plan.name}: first meal ${deliveries[0]?.scheduledFor.toISOString().slice(0, 10) ?? subscription.startDate.toISOString().slice(0, 10)}, ${dto.mealCount} meals paid.`,
        subscription.id,
      );

      const dayContext = await this.dayContext(
        plan.id,
        plan.weeklyMenu,
        deliveries.map((d) => d.scheduledFor),
      );
      return mapMealSubscription(subscription, {
        plan,
        deliveries,
        vendorName: plan.vendor.name,
        dayContext,
      });
    });
  }

  async list(userId: string) {
    const subscriptions = await this.prisma.mealSubscription.findMany({
      where: { userId },
      include: { plan: { include: { vendor: true } } },
      orderBy: { createdAt: 'desc' },
    });

    return subscriptions.map((subscription) =>
      mapMealSubscription(subscription, {
        plan: subscription.plan,
        vendorName: subscription.plan.vendor.name,
      }),
    );
  }

  async getOne(userId: string, id: string) {
    const subscription = await this.findOwned(userId, id);
    const deliveries = await this.prisma.mealDelivery.findMany({
      where: { subscriptionId: subscription.id },
      orderBy: { scheduledFor: 'asc' },
    });
    const dayContext = await this.dayContext(
      subscription.planId,
      subscription.plan.weeklyMenu,
      deliveries.map((d) => d.scheduledFor),
    );
    return mapMealSubscription(subscription, {
      plan: subscription.plan,
      deliveries,
      vendorName: subscription.plan.vendor.name,
      dayContext,
    });
  }

  async pause(userId: string, id: string) {
    const subscription = await this.findOwned(userId, id);
    if (subscription.status !== 'active') {
      throw new ConflictException(`This subscription is ${subscription.status}, so it cannot be paused.`);
    }

    // A locked date's meal is already being planned (M37): pausing at
    // 11pm does not un-cook tomorrow's lunch, so locked rows stay
    // `scheduled` and still arrive. Everything unlocked stops.
    const { menuLockTime } = await this.settings.get();
    const now = new Date();
    const scheduled = await this.prisma.mealDelivery.findMany({
      where: { subscriptionId: id, status: 'scheduled' },
      select: { id: true, scheduledFor: true },
    });
    const unlockedIds = scheduled
      .filter((d) => !isMenuLocked(d.scheduledFor, menuLockTime, now))
      .map((d) => d.id);
    const lockedCount = scheduled.length - unlockedIds.length;

    const updated = await this.prisma.$transaction(async (tx) => {
      // Past rows are history and are never rewritten — a delivered meal
      // stays delivered.
      await tx.mealDelivery.updateMany({
        where: { id: { in: unlockedIds } },
        data: { status: 'cancelled', reason: 'Subscription paused' },
      });
      return tx.mealSubscription.update({
        where: { id },
        data: { status: 'paused', pausedAt: new Date() },
      });
    });

    this.tell(
      userId,
      'Meal plan paused',
      lockedCount > 0
        ? `${subscription.plan.name} is paused. ${lockedCount === 1 ? 'One meal was' : `${lockedCount} meals were`} already being planned and will still arrive; your seat is kept.`
        : `${subscription.plan.name} is paused. Your seat is kept until you resume.`,
      id,
    );

    return mapMealSubscription(updated, { plan: subscription.plan });
  }

  /**
   * Resume rebuilds the remaining schedule from today forward rather than
   * restoring the old dates — those are in the past by the time anybody
   * un-pauses, and reinstating them would hand a kitchen a queue of meals
   * that were due last week.
   */
  async resume(userId: string, id: string) {
    const subscription = await this.findOwned(userId, id);
    if (subscription.status !== 'paused') {
      throw new ConflictException(`This subscription is ${subscription.status}, so it cannot be resumed.`);
    }
    if (subscription.mealsRemaining <= 0) {
      throw new ConflictException('This subscription has no meals left. Start a new cycle instead.');
    }

    const plan = await this.prisma.mealPlan.findUniqueOrThrow({
      where: { id: subscription.planId },
      include: { vendor: { include: { profile: true, blackouts: true } } },
    });
    const profile = plan.vendor.profile;

    const startDate = earliestStartDate(new Date(), profile?.prepTimeMins);
    const dates = scheduleDates(startDate, subscription.daysOfWeek, subscription.mealsRemaining, {
      workingDays: profile?.workingDays ?? [],
      blackoutDates: plan.vendor.blackouts.map((b) => b.date),
    });

    if (dates.length < subscription.mealsRemaining) {
      throw new BadRequestException(
        `${plan.vendor.name} cannot fit your remaining ${subscription.mealsRemaining} meals on the days you picked.`,
      );
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      for (const date of dates) {
        // The `(subscriptionId, scheduledFor)` unique index is what makes
        // this safe to re-run: a paused-then-resumed subscription can land
        // on a date it already has a cancelled row for.
        await tx.mealDelivery.upsert({
          where: {
            subscriptionId_scheduledFor: { subscriptionId: id, scheduledFor: date },
          },
          create: {
            subscriptionId: id,
            scheduledFor: date,
            bracketStart: subscription.bracketStart,
          },
          update: { status: 'scheduled', reason: null },
        });
      }
      return tx.mealSubscription.update({
        where: { id },
        data: {
          status: 'active',
          pausedAt: null,
          endDate: dates[dates.length - 1],
        },
      });
    });

    this.tell(
      userId,
      'Meal plan resumed',
      `${plan.name} is back on — next meal ${dates[0]?.toISOString().slice(0, 10)}, ${subscription.mealsRemaining} meals to go.`,
      id,
    );

    return mapMealSubscription(updated, { plan });
  }

  /**
   * Skip one day. The meal is not lost — it is owed, so the cycle grows a
   * day at the far end. A buyer who paid for 24 meals gets 24 meals.
   */
  async skip(userId: string, id: string, deliveryId: string) {
    const subscription = await this.findOwned(userId, id);
    if (subscription.status !== 'active') {
      throw new ConflictException(`This subscription is ${subscription.status}.`);
    }

    const delivery = await this.prisma.mealDelivery.findFirst({
      where: { id: deliveryId, subscriptionId: id },
    });
    if (!delivery) throw new NotFoundException('Delivery not found');
    if (delivery.status !== 'scheduled') {
      throw new ConflictException(`That meal is already ${delivery.status}.`);
    }

    // M37 — the same lock that freezes the kitchen's menu freezes the
    // buyer's skip: after `menuLockTime` the evening before, that meal is
    // being planned and possibly cooked.
    const { menuLockTime } = await this.settings.get();
    if (isMenuLocked(delivery.scheduledFor, menuLockTime, new Date())) {
      throw new ConflictException(
        `That meal is already being planned — changes close at ${menuLockTime} the evening before. This one will still be delivered.`,
      );
    }

    const plan = await this.prisma.mealPlan.findUniqueOrThrow({
      where: { id: subscription.planId },
      include: { vendor: { include: { profile: true, blackouts: true } } },
    });
    const profile = plan.vendor.profile;

    // A meal skipped for tomorrow cannot be re-served tomorrow, so the
    // replacement goes after everything currently scheduled.
    const dayAfterEnd = new Date(subscription.endDate);
    dayAfterEnd.setUTCDate(dayAfterEnd.getUTCDate() + 1);

    const [replacement] = scheduleDates(dayAfterEnd, subscription.daysOfWeek, 1, {
      workingDays: profile?.workingDays ?? [],
      blackoutDates: plan.vendor.blackouts.map((b) => b.date),
    });

    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.mealDelivery.update({
        where: { id: deliveryId },
        data: { status: 'skipped', skippedAt: new Date(), reason: 'Skipped by you' },
      });

      if (!replacement) {
        // No day within a year satisfies the buyer's own day selection. Log
        // it rather than fail the skip: refusing to let somebody skip a meal
        // because we cannot schedule its replacement is the wrong trade.
        this.logger.warn(
          `Skipped delivery ${deliveryId} could not be rescheduled for subscription ${id}`,
        );
        return tx.mealSubscription.findUniqueOrThrow({ where: { id } });
      }

      await tx.mealDelivery.upsert({
        where: {
          subscriptionId_scheduledFor: { subscriptionId: id, scheduledFor: replacement },
        },
        create: {
          subscriptionId: id,
          scheduledFor: replacement,
          bracketStart: subscription.bracketStart,
        },
        update: { status: 'scheduled', reason: null },
      });

      return tx.mealSubscription.update({
        where: { id },
        data: { endDate: replacement },
      });
    });

    this.tell(
      userId,
      'Meal skipped',
      replacement
        ? `${plan.name}: ${delivery.scheduledFor.toISOString().slice(0, 10)} is skipped — owed, not lost. It moves to ${replacement.toISOString().slice(0, 10)}.`
        : `${plan.name}: ${delivery.scheduledFor.toISOString().slice(0, 10)} is skipped. We could not find a replacement day on your selection — support will sort it.`,
      id,
    );

    return mapMealSubscription(updated, { plan });
  }

  /**
   * Cancel is terminal and **moves no money**. An unused meal is a refund
   * decision, and the same rule M15 set for returns applies: an automatic
   * refund would make the most abusable path the most frictionless, and the
   * loss lands on a home cook who has already bought the ingredients. An
   * admin resolves it through `POST /wallet/adjust`, where it is audited.
   */
  async cancel(userId: string, id: string) {
    const subscription = await this.findOwned(userId, id);
    if (subscription.status === 'cancelled') {
      throw new ConflictException('This subscription is already cancelled.');
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.mealDelivery.updateMany({
        where: { subscriptionId: id, status: 'scheduled' },
        data: { status: 'cancelled', reason: 'Subscription cancelled' },
      });
      return tx.mealSubscription.update({
        where: { id },
        data: { status: 'cancelled', cancelledAt: new Date() },
      });
    });

    this.tell(
      userId,
      'Meal plan cancelled',
      `${subscription.plan.name} is cancelled. ${subscription.mealsRemaining > 0 ? `${subscription.mealsRemaining} unused meals do not auto-refund — Homekrafted support resolves them.` : 'No meals were left on the cycle.'}`,
      id,
    );

    return mapMealSubscription(updated, { plan: subscription.plan });
  }

  /**
   * Ownership check in one place. Every mutation goes through it, so no
   * handler can accidentally address a subscription by id alone.
   */
  private async findOwned(userId: string, id: string) {
    const subscription = await this.prisma.mealSubscription.findFirst({
      where: { id, userId },
      include: { plan: { include: { vendor: true } } },
    });
    // 404 rather than 403: somebody else's subscription id should not be
    // confirmable by the error it produces.
    if (!subscription) throw new NotFoundException('Subscription not found');
    return subscription;
  }
}

/** Re-exported so tests and the seller portal share one definition of "today". */
export { toDateKey };
export type { Prisma };
