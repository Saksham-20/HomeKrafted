import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { MealPlan, MealPlanDayMenu } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AdminSettingsService } from '../admin/settings.service';
import { NotificationsDeliveryService } from '../notifications/notifications-delivery.service';
import { isMenuLocked, menuLockAt } from './menu-lock';

/**
 * Per-date menus for a meal plan (M37) — the difference between "this
 * plan generally serves rajma on Thursdays" (`weeklyMenu`, a marketing
 * rotation) and "on 20 August you are getting chole" (a
 * `MealPlanDayMenu` row, an operational fact a subscriber can plan
 * around).
 *
 * Three rules:
 * - **A date locks at `menuLockTime` IST the evening before**
 *   (`menu-lock.ts`). After that the kitchen cannot change it — only an
 *   admin can, through the audited override — and a buyer cannot skip
 *   it. That is what makes "what's for lunch tomorrow" a promise.
 * - **A change to a set menu notifies the people already scheduled for
 *   that date.** First-time setting a day is planning, not a change —
 *   nobody was promised anything yet, so nobody is messaged.
 * - **The weekday fallback is opt-in by shape.** `weeklyMenu` has never
 *   had weekday anchoring; guessing one for a 5-line rotation would show
 *   wrong dishes with confidence. Exactly 7 lines is read as Monday →
 *   Sunday (index 0 = Monday, how people write week lists — the
 *   assumption is labelled where it is authored, in `MealPlanForm`).
 */

/** `'2026-08-20'` → UTC-midnight Date, or null. The `:date` route param shape. */
export function parseDateParam(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/** The Monday-first index into a 7-line `weeklyMenu` for `date`, or null when the shape opts out. */
export function templateLineFor(weeklyMenu: string[], date: Date): string | null {
  if (weeklyMenu.length !== 7) return null;
  return weeklyMenu[(date.getUTCDay() + 6) % 7] ?? null;
}

export interface DayMenuView {
  /** `YYYY-MM-DD`. */
  date: string;
  lines: string[];
  /** Where the lines came from — a set day, the 7-line weekly rotation, or nothing. */
  source: 'day' | 'template' | 'none';
  locked: boolean;
  lockAt: string;
  /** Deliveries still `scheduled` for this date — who a change reaches. */
  scheduledCount: number;
}

const isoDay = (date: Date) => date.toISOString().slice(0, 10);

@Injectable()
export class MealPlanDayMenusService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: AdminSettingsService,
    private readonly notifications: NotificationsDeliveryService,
  ) {}

  /** The next `days` dates for one plan, with lock state and audience size per date. */
  async getRange(plan: Pick<MealPlan, 'id' | 'weeklyMenu'>, days: number, now: Date) {
    const { menuLockTime } = await this.settings.get();
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const end = new Date(start.getTime() + days * 24 * 60 * 60 * 1000);

    const [rows, scheduled] = await Promise.all([
      this.prisma.mealPlanDayMenu.findMany({
        where: { planId: plan.id, date: { gte: start, lt: end } },
      }),
      this.prisma.mealDelivery.groupBy({
        by: ['scheduledFor'],
        where: {
          status: 'scheduled',
          scheduledFor: { gte: start, lt: end },
          subscription: { planId: plan.id },
        },
        _count: { _all: true },
      }),
    ]);

    const rowByDay = new Map(rows.map((r) => [isoDay(r.date), r]));
    const countByDay = new Map(scheduled.map((g) => [isoDay(g.scheduledFor), g._count._all]));

    const out: DayMenuView[] = [];
    for (let i = 0; i < days; i += 1) {
      const date = new Date(start.getTime() + i * 24 * 60 * 60 * 1000);
      const key = isoDay(date);
      const row = rowByDay.get(key);
      const template = templateLineFor(plan.weeklyMenu, date);
      out.push({
        date: key,
        lines: row ? row.lines : template ? [template] : [],
        source: row ? 'day' : template ? 'template' : 'none',
        locked: isMenuLocked(date, menuLockTime, now),
        lockAt: menuLockAt(date, menuLockTime).toISOString(),
        scheduledCount: countByDay.get(key) ?? 0,
      });
    }

    return { lockTime: menuLockTime, days: out };
  }

  /**
   * Set (or, with `[]`, clear) one date's menu.
   *
   * Returns the updated view row. When the date already had a set menu
   * with different lines and subscribers are scheduled for it, they are
   * told — `void`, after the write, on the `meals` category.
   */
  async setDayMenu(
    plan: Pick<MealPlan, 'id' | 'name' | 'weeklyMenu'>,
    date: Date,
    lines: string[],
    options: { enforceLock: boolean; now: Date },
  ): Promise<DayMenuView> {
    const { menuLockTime } = await this.settings.get();
    const locked = isMenuLocked(date, menuLockTime, options.now);

    if (options.enforceLock && locked) {
      throw new BadRequestException(
        `That date is locked — menus close at ${menuLockTime} the evening before, so subscribers can plan around what you told them. If it genuinely has to change, ask Homekrafted support.`,
      );
    }

    const cleaned = lines.map((l) => l.trim()).filter((l) => l.length > 0);
    const existing = await this.prisma.mealPlanDayMenu.findUnique({
      where: { planId_date: { planId: plan.id, date } },
    });

    let row: MealPlanDayMenu | null = null;
    if (cleaned.length === 0) {
      if (existing) {
        await this.prisma.mealPlanDayMenu.delete({ where: { id: existing.id } });
      }
    } else {
      row = await this.prisma.mealPlanDayMenu.upsert({
        where: { planId_date: { planId: plan.id, date } },
        create: { planId: plan.id, date, lines: cleaned },
        update: { lines: cleaned },
      });
    }

    // A *change* to a previously set date reaches the people scheduled
    // for it. A first-time set is planning; clearing back to the
    // rotation counts as a change too — their meal changed either way.
    const changed =
      existing !== null && JSON.stringify(existing.lines) !== JSON.stringify(cleaned);
    if (changed) {
      void this.notifyScheduledSubscribers(plan, date, cleaned).catch(() => undefined);
    }

    const template = templateLineFor(plan.weeklyMenu, date);
    return {
      date: isoDay(date),
      lines: row ? row.lines : template ? [template] : [],
      source: row ? 'day' : template ? 'template' : 'none',
      locked,
      lockAt: menuLockAt(date, menuLockTime).toISOString(),
      scheduledCount: await this.scheduledCount(plan.id, date),
    };
  }

  /** Resolve a plan the *seller* owns, 404-shaped like every owner scope. */
  async findOwnedPlan(sellerId: string, planId: string) {
    const plan = await this.prisma.mealPlan.findFirst({ where: { id: planId, sellerId } });
    if (!plan) throw new NotFoundException('Meal plan not found');
    return plan;
  }

  /** Admin path: any plan, by id. */
  async findPlan(planId: string) {
    const plan = await this.prisma.mealPlan.findUnique({ where: { id: planId } });
    if (!plan) throw new NotFoundException('Meal plan not found');
    return plan;
  }

  private async scheduledCount(planId: string, date: Date): Promise<number> {
    return this.prisma.mealDelivery.count({
      where: { status: 'scheduled', scheduledFor: date, subscription: { planId } },
    });
  }

  private async notifyScheduledSubscribers(
    plan: Pick<MealPlan, 'id' | 'name' | 'weeklyMenu'>,
    date: Date,
    lines: string[],
  ): Promise<void> {
    const deliveries = await this.prisma.mealDelivery.findMany({
      where: { status: 'scheduled', scheduledFor: date, subscription: { planId: plan.id } },
      select: { subscription: { select: { userId: true, id: true } } },
    });
    const userIds = [...new Set(deliveries.map((d) => d.subscription.userId))];
    const dateLabel = date.toLocaleDateString('en-IN', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      timeZone: 'UTC',
    });
    const template = templateLineFor(plan.weeklyMenu, date);
    const menuText =
      lines.length > 0 ? lines.join(', ') : (template ?? 'the usual rotation');

    for (const userId of userIds) {
      await this.notifications
        .deliver({
          userId,
          category: 'meals',
          title: `Menu changed for ${dateLabel}`,
          body: `${plan.name} now serves: ${menuText}.`,
          refType: 'mealPlan',
          refId: plan.id,
        })
        .catch(() => undefined);
    }
  }
}
