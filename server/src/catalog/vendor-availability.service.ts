import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MealBlackoutCascadeService } from '../meals/blackout-cascade.service';

export interface VendorAvailability {
  vendorId: string;
  /**
   * Minutes of notice this kitchen needs before a slot opens. Falls back
   * to the platform default when the HomeKrafter hasn't said — a missing
   * prep time must not mean "instant", which is the reading that gets a
   * home cook an order they cannot make.
   */
  prepTimeMins: number;
  /** 0 = Sunday. Empty means "not stated", which the picker reads as every day. */
  workingDays: number[];
  /** `YYYY-MM-DD` days this kitchen is closed, with the reason to show. */
  blackouts: { date: string; reason?: string }[];
  /** How many orders a day they can take, when they've said. Advisory — nothing enforces it yet. */
  capacityPerDay?: number;
}

/**
 * The platform's own floor when a kitchen hasn't declared a prep time.
 * Ninety minutes is what `client/lib/schedule.ts` has always used as its
 * lead time, so an undeclared kitchen behaves exactly as it did before
 * M16 rather than suddenly becoming stricter or laxer.
 */
export const DEFAULT_PREP_TIME_MINS = 90;

/**
 * "When can this kitchen actually take an order" (M16, M2).
 *
 * Pre-order scheduling was rolling days plus a fixed 90-minute lead time,
 * identical for every HomeKrafter — so a baker who needs 48 hours for a
 * cake and a cook who can fry samosas in an hour were offered the same
 * slots, and neither could mark a day off. This is the per-kitchen
 * version of that.
 *
 * Three separate things, deliberately not merged:
 * - `workingDays` — the weekly pattern (`VendorProfile`).
 * - `blackouts` — exceptions to it (`VendorBlackoutDate`).
 * - `prepTimeMins` — how much notice, not which days.
 *
 * A recurring blackout rule would collide with `workingDays` and make
 * "am I open on the 14th" answerable two different ways.
 */
@Injectable()
export class VendorAvailabilityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly blackoutCascade: MealBlackoutCascadeService,
  ) {}

  async forVendor(vendorId: string): Promise<VendorAvailability> {
    const vendor = await this.prisma.vendor.findUnique({
      where: { id: vendorId },
      select: { id: true },
    });
    if (!vendor) throw new NotFoundException('Vendor not found');

    const [profile, blackouts] = await Promise.all([
      this.prisma.vendorProfile.findUnique({
        where: { vendorId },
        select: { prepTimeMins: true, workingDays: true, capacityPerDay: true },
      }),
      // Only from today forward. A blackout that has passed is history,
      // and shipping it would grow this payload for every year the
      // kitchen stays open.
      this.prisma.vendorBlackoutDate.findMany({
        where: { vendorId, date: { gte: startOfToday() } },
        orderBy: { date: 'asc' },
      }),
    ]);

    return {
      vendorId,
      prepTimeMins: profile?.prepTimeMins ?? DEFAULT_PREP_TIME_MINS,
      workingDays: profile?.workingDays ?? [],
      blackouts: blackouts.map((b) => ({
        date: isoDate(b.date),
        reason: b.reason ?? undefined,
      })),
      capacityPerDay: profile?.capacityPerDay ?? undefined,
    };
  }

  async listBlackouts(vendorId: string) {
    const rows = await this.prisma.vendorBlackoutDate.findMany({
      where: { vendorId },
      orderBy: { date: 'asc' },
    });
    return rows.map((b) => ({ id: b.id, date: isoDate(b.date), reason: b.reason ?? undefined }));
  }

  /** Idempotent: marking the same day off twice is the same state, not a 409. */
  async addBlackout(vendorId: string, date: string, reason?: string) {
    const day = parseDateOnly(date);
    await this.prisma.vendorBlackoutDate.upsert({
      where: { vendorId_date: { vendorId, date: day } },
      create: { vendorId, date: day, reason },
      update: { reason },
    });

    // M37 — the day off reaches the meals already sold for it. Until now
    // a blackout was consulted only when a schedule was *generated*, so
    // existing subscribers' deliveries for the date stayed `scheduled`
    // while the kitchen stayed shut. Awaited (not floated): the cascade
    // is idempotent, and the seller deserves the failure if it breaks.
    await this.blackoutCascade.applyBlackout(vendorId, day, reason);

    return this.listBlackouts(vendorId);
  }

  /** Scoped by `vendorId` in the filter, so another kitchen's id matches nothing rather than reopening their day. */
  async removeBlackout(vendorId: string, id: string) {
    await this.prisma.vendorBlackoutDate.deleteMany({ where: { id, vendorId } });
    return this.listBlackouts(vendorId);
  }
}

/** Dates are stored as `@db.Date` at UTC midnight — parse and format without letting a timezone shift the day. */
function parseDateOnly(value: string): Date {
  return new Date(`${value.slice(0, 10)}T00:00:00.000Z`);
}

function isoDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function startOfToday(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
}
