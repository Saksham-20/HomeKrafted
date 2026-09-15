import { BadRequestException } from '@nestjs/common';
import { computeShipping } from '../../src/common/pricing/pricing.util';
import { AdminSettingsService, DEFAULT_SETTINGS } from '../../src/admin/settings.service';

/**
 * The delivery fee moved from a hardcoded ₹49 to platform settings
 * (2026-09-15). The cart and the order both call `computeShipping` with the
 * settings they read, so what a buyer is shown is what they are charged.
 */
describe('computeShipping', () => {
  const rule = { deliveryFee: 49, freeDeliveryThreshold: 999 };

  it('charges the flat fee under the threshold', () => {
    expect(computeShipping(500, rule)).toBe(49);
  });

  it('delivers free at or above the threshold', () => {
    expect(computeShipping(999, rule)).toBe(0);
    expect(computeShipping(1500, rule)).toBe(0);
  });

  it('charges nothing when the fee is zero, whatever the basket', () => {
    expect(computeShipping(10, { deliveryFee: 0, freeDeliveryThreshold: 999 })).toBe(0);
  });

  it('reads a zero threshold as "no free-delivery offer", not "everything free"', () => {
    expect(computeShipping(5000, { deliveryFee: 49, freeDeliveryThreshold: 0 })).toBe(49);
  });

  it('charges nothing on an empty basket', () => {
    expect(computeShipping(0, rule)).toBe(0);
  });
});

describe('delivery settings', () => {
  function service(rows: { key: string; value: string }[] = []) {
    const prisma = {
      platformSetting: { findMany: jest.fn().mockResolvedValue(rows), upsert: jest.fn((a) => a) },
      $transaction: jest.fn().mockResolvedValue([]),
    };
    return new AdminSettingsService(prisma as never, { log: jest.fn() } as never);
  }

  it('defaults to free delivery (owner, 2026-09-15)', async () => {
    expect(DEFAULT_SETTINGS.deliveryFee).toBe(0);
    expect((await service().get()).deliveryFee).toBe(0);
  });

  it('reads a stored fee back as a number', async () => {
    const settings = await service([{ key: 'deliveryFee', value: '49' }]).get();
    expect(settings.deliveryFee).toBe(49);
  });

  it('refuses a negative fee or an absurd one', async () => {
    await expect(service().update('admin', { deliveryFee: -1 })).rejects.toBeInstanceOf(BadRequestException);
    await expect(service().update('admin', { deliveryFee: 5000 })).rejects.toBeInstanceOf(BadRequestException);
    await expect(service().update('admin', { freeDeliveryThreshold: -5 })).rejects.toBeInstanceOf(BadRequestException);
  });
});
