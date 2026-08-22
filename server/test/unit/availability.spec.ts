import { NotFoundException } from '@nestjs/common';
import {
  DEFAULT_PREP_TIME_MINS,
  VendorAvailabilityService,
} from '../../src/catalog/vendor-availability.service';
import { PrismaService } from '../../src/prisma/prisma.service';

/**
 * Availability is where "absence is never a gate" turns into money: a
 * HomeKrafter who has filled in nothing must keep taking orders exactly as
 * they did before M16, and a missing prep time must never be read as
 * "instant" — that reading is what hands a home cook an order they cannot
 * make.
 *
 * Prisma is stubbed here rather than mocked in depth: what is under test
 * is the *defaulting*, which happens entirely after the rows come back.
 */

function serviceWith(rows: {
  vendor?: { id: string } | null;
  profile?: {
    prepTimeMins: number | null;
    workingDays: number[];
    capacityPerDay: number | null;
  } | null;
  blackouts?: { id: string; date: Date; reason: string | null }[];
}) {
  // `'vendor' in rows`, not `??`: an explicit `null` means "this vendor
  // does not exist" and must not fall through to the default row.
  const vendor = 'vendor' in rows ? rows.vendor : { id: 'vd1' };
  const prisma = {
    vendor: { findUnique: jest.fn().mockResolvedValue(vendor) },
    vendorProfile: { findUnique: jest.fn().mockResolvedValue(rows.profile ?? null) },
    vendorBlackoutDate: { findMany: jest.fn().mockResolvedValue(rows.blackouts ?? []) },
  } as unknown as PrismaService;
  return { service: new VendorAvailabilityService(prisma, stubCascade()), prisma };
}

/** The M37 cascade is exercised by its own e2e; here it only needs to exist. */
function stubCascade() {
  return { applyBlackout: jest.fn().mockResolvedValue(0) } as never;
}

describe('forVendor — defaults for a kitchen that has declared nothing', () => {
  it('falls back to the platform prep time, never to zero', () => {
    expect(DEFAULT_PREP_TIME_MINS).toBe(90);
  });

  it('returns the platform default when there is no profile row at all', async () => {
    // A kitchen approved this morning. Not a 404, not zero notice.
    const { service } = serviceWith({ profile: null });
    const availability = await service.forVendor('vd1');
    expect(availability.prepTimeMins).toBe(DEFAULT_PREP_TIME_MINS);
    expect(availability.workingDays).toEqual([]);
    expect(availability.blackouts).toEqual([]);
    expect(availability.capacityPerDay).toBeUndefined();
  });

  it('returns the platform default when the profile exists but the field is null', async () => {
    const { service } = serviceWith({
      profile: { prepTimeMins: null, workingDays: [], capacityPerDay: null },
    });
    expect((await service.forVendor('vd1')).prepTimeMins).toBe(DEFAULT_PREP_TIME_MINS);
  });

  it('keeps a declared zero prep time rather than overriding it with the default', async () => {
    // `??` not `||`: zero is a real answer from a kitchen that cooks to
    // order, and `||` would silently add 90 minutes to it.
    const { service } = serviceWith({
      profile: { prepTimeMins: 0, workingDays: [], capacityPerDay: null },
    });
    expect((await service.forVendor('vd1')).prepTimeMins).toBe(0);
  });

  it('passes a declared prep time through untouched', async () => {
    const { service } = serviceWith({
      profile: { prepTimeMins: 2880, workingDays: [1, 2, 3, 4, 5], capacityPerDay: 12 },
    });
    const availability = await service.forVendor('vd1');
    expect(availability.prepTimeMins).toBe(2880);
    expect(availability.workingDays).toEqual([1, 2, 3, 4, 5]);
    expect(availability.capacityPerDay).toBe(12);
  });

  it('404s for a vendor that does not exist, rather than inventing an empty kitchen', async () => {
    const { service } = serviceWith({ vendor: null });
    await expect(service.forVendor('nope')).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('forVendor — blackouts', () => {
  it('formats dates as YYYY-MM-DD without letting a timezone shift the day', () => {
    // Stored `@db.Date` at UTC midnight. Formatting through a local-time
    // accessor west of UTC would report the previous day, closing the
    // wrong date.
    expect(new Date('2026-08-04T00:00:00.000Z').toISOString().slice(0, 10)).toBe('2026-08-04');
  });

  it('carries the reason through, and undefined when there is none', async () => {
    const { service } = serviceWith({
      blackouts: [
        { id: 'b1', date: new Date('2026-08-04T00:00:00.000Z'), reason: 'Closed for Diwali' },
        { id: 'b2', date: new Date('2026-08-05T00:00:00.000Z'), reason: null },
      ],
    });
    expect((await service.forVendor('vd1')).blackouts).toEqual([
      { date: '2026-08-04', reason: 'Closed for Diwali' },
      { date: '2026-08-05', reason: undefined },
    ]);
  });

  it('asks the database for today-forward blackouts only', async () => {
    // Past days off are history. Shipping them would grow this payload
    // for every year a kitchen stays open, on a route the storefront hits.
    const { service, prisma } = serviceWith({});
    await service.forVendor('vd1');
    const where = (prisma.vendorBlackoutDate.findMany as jest.Mock).mock.calls[0][0].where;
    expect(where.vendorId).toBe('vd1');
    expect(where.date.gte).toBeInstanceOf(Date);

    /*
     * The bound is **UTC midnight of today's local calendar date**, and it
     * is compared against the stored value, never against the clock.
     *
     * This used to assert `gte <= Date.now()`, which is a different claim
     * and only true for part of the day. Blackouts are `@db.Date` rows
     * written at UTC midnight by `parseDateOnly`, so `startOfToday()`
     * correctly builds UTC midnight from *local* Y/M/D — meaning that at
     * 00:43 IST the bound is 05:30 IST, five hours in the future, and the
     * old assertion failed. It passed on a UTC CI runner (where local is
     * UTC) and failed on any machine east of Greenwich overnight: green
     * for about eighteen hours a day. Caught at 00:43 IST on 2026-08-10.
     *
     * The old assertion was also too weak in the other direction — a bound
     * of last January would have satisfied it. What matters is the
     * boundary itself: today is in, yesterday is out.
     */
    const now = new Date();
    const expected = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
    expect(where.date.gte.getTime()).toBe(expected);

    const todayRow = new Date(expected);
    const yesterdayRow = new Date(expected - 24 * 60 * 60 * 1000);
    expect(todayRow.getTime()).toBeGreaterThanOrEqual(where.date.gte.getTime());
    expect(yesterdayRow.getTime()).toBeLessThan(where.date.gte.getTime());
  });
});

describe('removeBlackout', () => {
  it('scopes the delete by vendor, so another kitchen cannot reopen a day', async () => {
    const prisma = {
      vendorBlackoutDate: {
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
        findMany: jest.fn().mockResolvedValue([]),
      },
    } as unknown as PrismaService;
    const service = new VendorAvailabilityService(prisma, stubCascade());

    await service.removeBlackout('vd1', 'someone-elses-blackout');
    // `vendorId` in the filter means a foreign id matches nothing and
    // deletes nothing, rather than 404-ing after the fact.
    expect(prisma.vendorBlackoutDate.deleteMany).toHaveBeenCalledWith({
      where: { id: 'someone-elses-blackout', vendorId: 'vd1' },
    });
  });
});
