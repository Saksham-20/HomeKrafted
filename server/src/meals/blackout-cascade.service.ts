import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsDeliveryService } from '../notifications/notifications-delivery.service';
import { scheduleDates } from './meal-brackets';

/**
 * What a kitchen's day off does to the meals already sold for it (M37).
 *
 * Until now a `VendorBlackoutDate` was consulted only when a schedule was
 * *generated* — at subscribe, resume and skip. A blackout added after
 * somebody subscribed touched nothing: their delivery for that date
 * stayed `scheduled`, the kitchen didn't cook, and the row quietly lied.
 * (`MealDeliveryStatus.unavailable` existed from M19 and nothing ever
 * wrote it — this service is its first writer.)
 *
 * The mechanics mirror `skip()` exactly, because the promise is the
 * same one: **a meal not served is owed, not lost.** The affected
 * delivery goes `unavailable` with the reason, a replacement is
 * scheduled after the cycle's current end on the buyer's own days, and
 * the subscriber is told on the `meals` category.
 *
 * Removing a blackout does NOT un-mark anything — recorded facts stay
 * (the same rule skip and pause follow), and the replacement is already
 * owed.
 */
@Injectable()
export class MealBlackoutCascadeService {
  private readonly logger = new Logger(MealBlackoutCascadeService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsDeliveryService,
  ) {}

  /** Apply one new blackout date to every active subscription it hits. Returns how many meals moved. */
  async applyBlackout(vendorId: string, date: Date, reason?: string | null): Promise<number> {
    const affected = await this.prisma.mealDelivery.findMany({
      where: {
        status: 'scheduled',
        scheduledFor: date,
        // A paused subscriber's locked delivery stays `scheduled` on
        // purpose (pause() — "a locked date's meal is already being
        // planned"), so it still occupies this exact date and must be
        // cascaded identically to an active subscriber's.
        subscription: { status: { in: ['active', 'paused'] }, plan: { vendorId } },
      },
      include: {
        subscription: {
          include: { plan: { include: { vendor: { include: { profile: true, blackouts: true } } } } },
        },
      },
    });
    if (affected.length === 0) return 0;

    const closedNote = reason?.trim() || 'Kitchen closed that day';
    const moved: { userId: string; planName: string; vendorName: string }[] = [];

    for (const delivery of affected) {
      const subscription = delivery.subscription;
      const plan = subscription.plan;
      const profile = plan.vendor.profile;

      // The replacement goes after everything currently scheduled, on the
      // buyer's own day selection — identical to skip()'s reasoning.
      //
      // `subscription.endDate` is that basis for an active subscriber
      // (skip() and resume() both keep it in step with the latest
      // scheduled row), but pause() never lowers it when it cancels the
      // rest of a cycle's schedule — so for a paused subscriber it can
      // still be the *original*, now-mostly-cancelled cycle's end date,
      // long after the one locked row still standing. Trusting it there
      // pushes the makeup meal out to a stale, often much-later date
      // instead of landing right after the blackout. Read the actual
      // latest surviving `scheduled` row instead, the same "after
      // everything currently actually scheduled" principle resume()
      // applies in `meal-subscriptions.service.ts`.
      let basisDate = subscription.endDate;
      if (subscription.status === 'paused') {
        const latestScheduled = await this.prisma.mealDelivery.findFirst({
          where: { subscriptionId: subscription.id, status: 'scheduled' },
          orderBy: { scheduledFor: 'desc' },
          select: { scheduledFor: true },
        });
        basisDate = latestScheduled && latestScheduled.scheduledFor > date ? latestScheduled.scheduledFor : date;
      }

      const dayAfterEnd = new Date(basisDate);
      dayAfterEnd.setUTCDate(dayAfterEnd.getUTCDate() + 1);
      const [replacement] = scheduleDates(dayAfterEnd, subscription.daysOfWeek, 1, {
        workingDays: profile?.workingDays ?? [],
        // Including the new date, so the replacement can never land on it.
        blackoutDates: [...plan.vendor.blackouts.map((b) => b.date), date],
      });

      await this.prisma.$transaction(async (tx) => {
        await tx.mealDelivery.update({
          where: { id: delivery.id },
          data: { status: 'unavailable', reason: closedNote },
        });

        if (!replacement) {
          // Same trade skip() makes: never fail the blackout because the
          // replacement cannot be scheduled — log it for a human.
          this.logger.warn(
            `Blackout ${date.toISOString().slice(0, 10)} left delivery ${delivery.id} without a replacement (subscription ${subscription.id})`,
          );
          return;
        }

        await tx.mealDelivery.upsert({
          where: {
            subscriptionId_scheduledFor: {
              subscriptionId: subscription.id,
              scheduledFor: replacement,
            },
          },
          create: {
            subscriptionId: subscription.id,
            scheduledFor: replacement,
            bracketStart: subscription.bracketStart,
          },
          update: { status: 'scheduled', reason: null },
        });

        await tx.mealSubscription.update({
          where: { id: subscription.id },
          data: { endDate: replacement },
        });
      });

      moved.push({
        userId: subscription.userId,
        planName: plan.name,
        vendorName: plan.vendor.name,
      });
    }

    // Told after the writes, never inside them — a paid schedule change
    // must not roll back because a message failed (the M18 rule).
    const dateLabel = date.toLocaleDateString('en-IN', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      timeZone: 'UTC',
    });
    for (const entry of moved) {
      void this.notifications
        .deliver({
          userId: entry.userId,
          category: 'meals',
          title: `${entry.vendorName} is closed on ${dateLabel}`,
          body: `Your ${entry.planName} meal for that day moves to the end of your plan — owed, not lost.`,
          refType: 'vendor',
          refId: vendorId,
        })
        .catch(() => undefined);
    }

    return moved.length;
  }
}
