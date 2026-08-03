import { BadRequestException } from '@nestjs/common';
import { AdminSettingsService, DEFAULT_SETTINGS } from '../../src/admin/settings.service';
import { AdminAuditLogService } from '../../src/admin/audit-log.service';
import { PrismaService } from '../../src/prisma/prisma.service';

/**
 * Platform settings are two numbers, and both are the kind of number that
 * is wrong quietly. A commission typed as 120 would model a take rate that
 * pays a HomeKrafter to sell nothing; a settings table with no rows must
 * behave exactly like the hardcoded constants it replaced, or an untouched
 * deploy changes behaviour on its own.
 *
 * The audit assertion matters as much as the validation: "who dropped the
 * commission to 2%" is the question that actually gets asked, and the
 * answer has to survive the next person changing it back.
 */

function serviceWith(rows: { key: string; value: string }[]) {
  const upsert = jest.fn().mockImplementation((args) => args);
  const log = jest.fn().mockResolvedValue(undefined);
  const prisma = {
    platformSetting: { findMany: jest.fn().mockResolvedValue(rows), upsert },
    $transaction: jest.fn().mockResolvedValue([]),
  } as unknown as PrismaService;
  const service = new AdminSettingsService(prisma, { log } as unknown as AdminAuditLogService);
  return { service, prisma, upsert, log };
}

describe('get', () => {
  it('falls back to the defaults when nothing has ever been written', async () => {
    // An empty table has to behave identically to the constants this
    // replaced — otherwise adding the settings screen changed the platform.
    const { service } = serviceWith([]);
    expect(await service.get()).toEqual(DEFAULT_SETTINGS);
  });

  it('reads stored values back as numbers, not strings', async () => {
    // They are stored as text in a key/value table; a string leaking into
    // the commission line would concatenate rather than multiply.
    const { service } = serviceWith([
      { key: 'commissionPct', value: '12.5' },
      { key: 'defaultDeliveryRadiusKm', value: '8' },
    ]);
    const settings = await service.get();
    expect(settings.commissionPct).toBe(12.5);
    expect(settings.defaultDeliveryRadiusKm).toBe(8);
    expect(typeof settings.commissionPct).toBe('number');
  });

  it('falls back rather than propagating a corrupt row', async () => {
    // A hand-edited row shouldn't produce `NaN` in every downstream
    // calculation, silently.
    const { service } = serviceWith([{ key: 'commissionPct', value: 'twelve' }]);
    expect((await service.get()).commissionPct).toBe(DEFAULT_SETTINGS.commissionPct);
  });

  it('ignores an unknown key rather than surfacing it', async () => {
    // Every key returned here is read by something. A stale row from a
    // removed setting must not reappear in the API.
    //
    // `hamperBuilderEnabled` is the real example, not a hypothetical: it
    // was removed in M18 with the hamper builder it gated, and every
    // production database that ever had it flipped still holds the row.
    // Nothing drops those rows, so this is what stops them coming back as
    // dead config an admin might act on.
    const { service } = serviceWith([
      { key: 'removedLongAgo', value: 'true' },
      { key: 'hamperBuilderEnabled', value: 'true' },
    ]);
    expect(Object.keys(await service.get()).sort()).toEqual([
      'commissionPct',
      'defaultDeliveryRadiusKm',
    ]);
  });
});

describe('update — validation', () => {
  it.each([-1, 101, 1000])('rejects a commission of %i percent', async (commissionPct) => {
    // Over 100% pays a HomeKrafter to sell nothing; negative is a rebate.
    // Neither is a setting, both are typos.
    const { service, prisma } = serviceWith([]);
    await expect(service.update('admin-1', { commissionPct })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('accepts the boundaries', async () => {
    const { service } = serviceWith([]);
    await expect(service.update('admin-1', { commissionPct: 0 })).resolves.toBeDefined();
    await expect(service.update('admin-1', { commissionPct: 100 })).resolves.toBeDefined();
  });

  it.each([0, 0.5, 101])('rejects a delivery radius of %s km', async (defaultDeliveryRadiusKm) => {
    const { service } = serviceWith([]);
    await expect(
      service.update('admin-1', { defaultDeliveryRadiusKm }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('validates before writing anything, so a bad pair is all-or-nothing', async () => {
    const { service, prisma } = serviceWith([]);
    await expect(
      service.update('admin-1', { commissionPct: 12, defaultDeliveryRadiusKm: 500 }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});

describe('update — writing and auditing', () => {
  it('writes only the keys it was given', async () => {
    // A partial update must not reset the other setting to its default.
    const { service, upsert } = serviceWith([]);
    await service.update('admin-1', { commissionPct: 12 });
    expect(upsert).toHaveBeenCalledTimes(1);
    expect(upsert.mock.calls[0][0].where).toEqual({ key: 'commissionPct' });
  });

  it('records who changed it on the row itself', async () => {
    const { service, upsert } = serviceWith([]);
    await service.update('admin-7', { commissionPct: 12 });
    expect(upsert.mock.calls[0][0].create.updatedBy).toBe('admin-7');
    expect(upsert.mock.calls[0][0].update.updatedBy).toBe('admin-7');
  });

  it('audits with both the before and after state', async () => {
    const { service, log } = serviceWith([{ key: 'commissionPct', value: '10' }]);
    await service.update('admin-1', { commissionPct: 2 });

    expect(log).toHaveBeenCalledTimes(1);
    const entry = log.mock.calls[0][0];
    expect(entry.actorId).toBe('admin-1');
    expect(entry.action).toBe('platform_settings.update');
    expect(entry.targetType).toBe('PlatformSetting');
    // Before is what makes the log answer the question. An after-only
    // entry says a change happened, not what was undone.
    expect(entry.metadata.before.commissionPct).toBe(10);
    expect(entry.metadata).toHaveProperty('after');
  });

  it('does nothing at all for an empty patch', async () => {
    // Not a write, and not an audit entry — an audit log full of no-ops is
    // an audit log nobody reads.
    const { service, prisma, log } = serviceWith([]);
    const result = await service.update('admin-1', {});
    expect(result).toEqual(DEFAULT_SETTINGS);
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(log).not.toHaveBeenCalled();
  });
});
