import { ConsignmentStatus } from '@prisma/client';
import { ShippingService } from '../../src/shipping/shipping.service';

/**
 * `ingest()`'s own comment says "only the newest event describes where the
 * parcel is now", but the skip guard only fired when BOTH `!isNewest` and
 * `!moves` were true — so whenever a same-or-higher-rank status arrived
 * out of order (`moves` true, `isNewest` false), the freshness fields
 * (`currentLocation`/`statusNote`/`courierStatus`/`lastEventAt`) were
 * overwritten from the stale event anyway, alongside `status`.
 *
 * The fix decouples the two writes: freshness fields only when `isNewest`,
 * `status` (and its timestamp side-effects) only when `moves`, independent
 * of each other.
 */
function serviceWith(current: {
  status: ConsignmentStatus;
  lastEventAt: Date | null;
  courierStatus?: string;
  statusNote?: string | null;
  currentLocation?: string | null;
}) {
  const row = {
    id: 'c1',
    status: current.status,
    lastEventAt: current.lastEventAt,
    courierStatus: current.courierStatus ?? 'ofd',
    statusNote: current.statusNote ?? 'A previous, newer note',
    currentLocation: current.currentLocation ?? 'Newer Hub',
    riderName: null as string | null,
    riderContact: null as string | null,
  };
  const tx = {
    $queryRaw: jest.fn().mockResolvedValue(undefined),
    consignmentEvent: { create: jest.fn().mockResolvedValue({}) },
    consignment: {
      findUniqueOrThrow: jest.fn().mockResolvedValue(row),
      update: jest.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) => ({ ...row, ...data })),
    },
  };
  const prisma = {
    $transaction: jest.fn().mockImplementation((fn: (t: unknown) => unknown) => fn(tx)),
  };
  const service = new ShippingService(prisma as never, {} as never, {} as never, {} as never);
  // `ingest` is a private implementation detail of `handleCallback`/
  // `reconcile`; calling it directly (rather than through the public
  // `handleCallback`, which would also need `reconcileOrderStatus`
  // stubbed) keeps this test scoped to exactly the logic being fixed.
  const ingest = (service as unknown as {
    ingest: (id: string, event: unknown, payload: unknown) => Promise<string>;
  }).ingest.bind(service);
  return { ingest, tx };
}

describe('ShippingService#ingest — freshness vs. status advancement', () => {
  const newer = new Date('2026-09-10T12:00:00.000Z');
  const older = new Date('2026-09-10T08:00:00.000Z');

  it('a stale event that still advances rank moves status but leaves freshness fields untouched', async () => {
    // current: in_transit (rank 4), last seen at `newer`.
    // incoming: 'nc' -> exception (rank 5) — advances rank, but eventAt is
    // older than the row's own lastEventAt, so it is NOT the newest event.
    const { ingest, tx } = serviceWith({ status: ConsignmentStatus.in_transit, lastEventAt: newer });

    const outcome = await ingest(
      'c1',
      {
        awb: 'AWB1',
        courierStatus: 'nc',
        comments: 'Stale not-contactable event',
        location: 'Some Old Place',
        riderName: null,
        riderContact: null,
        eventAt: older,
      },
      {},
    );

    expect(outcome).toBe('advanced');
    expect(tx.consignment.update).toHaveBeenCalledTimes(1);
    const data = (tx.consignment.update.mock.calls[0][0] as { data: Record<string, unknown> }).data;
    expect(data.status).toBe(ConsignmentStatus.exception);
    // The freshness fields must NOT have been written from the stale event.
    expect(data).not.toHaveProperty('courierStatus');
    expect(data).not.toHaveProperty('statusNote');
    expect(data).not.toHaveProperty('currentLocation');
    expect(data).not.toHaveProperty('lastEventAt');
  });

  it('the newest event updates freshness fields even when it does not advance status', async () => {
    // current: exception (rank 5), last seen at `older`.
    // incoming: 'nc' -> exception again (same rank, does not "advance" per
    // advancesConsignment's current!=next check) but IS the newest event.
    const { ingest, tx } = serviceWith({ status: ConsignmentStatus.exception, lastEventAt: older });

    const outcome = await ingest(
      'c1',
      {
        awb: 'AWB1',
        courierStatus: 'nc',
        comments: 'Still not contactable',
        location: 'Rider is here now',
        riderName: null,
        riderContact: null,
        eventAt: newer,
      },
      {},
    );

    expect(outcome).toBe('recorded');
    expect(tx.consignment.update).toHaveBeenCalledTimes(1);
    const data = (tx.consignment.update.mock.calls[0][0] as { data: Record<string, unknown> }).data;
    expect(data.currentLocation).toBe('Rider is here now');
    expect(data.statusNote).toBe('Still not contactable');
    expect(data.lastEventAt).toEqual(newer);
    expect(data).not.toHaveProperty('status');
  });

  it('an event that is neither newest nor advancing is recorded and changes nothing on the row', async () => {
    const { ingest, tx } = serviceWith({ status: ConsignmentStatus.in_transit, lastEventAt: newer });

    const outcome = await ingest(
      'c1',
      {
        awb: 'AWB1',
        courierStatus: 'picked', // rank 3, below current rank 4 — does not advance
        comments: null,
        location: null,
        riderName: null,
        riderContact: null,
        eventAt: older,
      },
      {},
    );

    expect(outcome).toBe('recorded');
    expect(tx.consignment.update).not.toHaveBeenCalled();
  });

  it('the ordinary case — newest event that also advances — still writes both together', async () => {
    const { ingest, tx } = serviceWith({ status: ConsignmentStatus.in_transit, lastEventAt: older });

    const outcome = await ingest(
      'c1',
      {
        awb: 'AWB1',
        courierStatus: 'ofd',
        comments: 'Out for delivery',
        location: 'Sector 35',
        riderName: 'Ravi',
        riderContact: '9999999999',
        eventAt: newer,
      },
      {},
    );

    expect(outcome).toBe('advanced');
    const data = (tx.consignment.update.mock.calls[0][0] as { data: Record<string, unknown> }).data;
    expect(data.status).toBe(ConsignmentStatus.out_for_delivery);
    expect(data.currentLocation).toBe('Sector 35');
    expect(data.lastEventAt).toEqual(newer);
    expect(data.riderName).toBe('Ravi');
  });
});
