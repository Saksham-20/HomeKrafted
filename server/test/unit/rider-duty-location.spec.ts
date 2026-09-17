import { RiderDutyService } from '../../src/rider/rider-duty.service';

/**
 * `recordLocation()`'s write to `Rider.lastLat/lastLng/lastLocationAt`
 * must never regress the stored fix — dispatch and geofencing both trust
 * that column as "where the rider is right now". A stale/out-of-order
 * batch (a delayed retry carrying an older buffered run) landing after a
 * newer batch already updated the row must be a no-op on that column,
 * even though its own pings are still recorded.
 */

const USER = { userId: 'u1', role: 'rider' as const };
const RIDER = { id: 'ri1' };

function serviceWith() {
  const createMany = jest.fn().mockResolvedValue({ count: 0 });
  const updateMany = jest.fn().mockResolvedValue({ count: 1 });
  const findUniqueOrThrow = jest.fn();
  const prisma = {
    riderLocationPing: { createMany },
    rider: { updateMany, findUniqueOrThrow },
  };
  const riders = { resolveRider: jest.fn().mockResolvedValue(RIDER) };
  const service = new RiderDutyService(prisma as never, riders as never);
  return { service, prisma, createMany, updateMany };
}

function ping(recordedAt: string, overrides: Record<string, unknown> = {}) {
  return { lat: 30.7, lng: 76.78, accuracyM: 10, recordedAt, ...overrides };
}

describe('RiderDutyService.recordLocation — stale batch guard', () => {
  it('guards the fix update on the stored lastLocationAt, never a plain update', async () => {
    const { service, updateMany } = serviceWith();
    const recent = new Date().toISOString();

    await service.recordLocation(USER, { pings: [ping(recent)] } as never);

    expect(updateMany).toHaveBeenCalledWith({
      where: {
        id: 'ri1',
        OR: [{ lastLocationAt: null }, { lastLocationAt: { lt: new Date(recent) } }],
      },
      data: { lastLat: 30.7, lastLng: 76.78, lastLocationAt: new Date(recent) },
    });
  });

  it('still records the raw pings even when the fix update is guarded out', async () => {
    const { service, createMany, updateMany } = serviceWith();
    // Simulate the guard losing (an already-newer fix is stored): the
    // conditional update matches zero rows.
    updateMany.mockResolvedValue({ count: 0 });
    const older = new Date(Date.now() - 5 * 60 * 1000).toISOString();

    const result = await service.recordLocation(USER, { pings: [ping(older)] } as never);

    expect(createMany).toHaveBeenCalled();
    expect(result).toEqual({ accepted: 1, total: 1 });
  });

  it('picks the newest ping in the batch to guard and write with', async () => {
    const { service, updateMany } = serviceWith();
    const earlier = new Date(Date.now() - 60_000).toISOString();
    const later = new Date().toISOString();

    await service.recordLocation(
      USER,
      { pings: [ping(earlier, { lat: 1, lng: 1 }), ping(later, { lat: 2, lng: 2 })] } as never,
    );

    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { lastLat: 2, lastLng: 2, lastLocationAt: new Date(later) },
      }),
    );
  });
});
