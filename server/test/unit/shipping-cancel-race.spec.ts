import { ConflictException } from '@nestjs/common';
import { ConsignmentStatus } from '@prisma/client';
import { ShippingService } from '../../src/shipping/shipping.service';

/**
 * `cancel()` checks `status !== delivered` on a plain read, then — on the
 * AWB path — makes a ~15s HTTP call to the carrier before writing
 * `status: cancelled` unconditionally. A concurrent `ingest()` delivery
 * callback processed during that window used to be silently overwritten
 * back to `cancelled`, because the final write took no row lock and never
 * re-checked.
 *
 * The fix: the final check-and-write moves into `finalizeCancel`, which
 * takes the same `SELECT ... FOR UPDATE` row lock `ingest()` uses and
 * re-verifies the row has not reached a terminal state immediately before
 * writing `cancelled`.
 */
function serviceWith(opts: {
  initialStatus?: ConsignmentStatus;
  awbNumber?: string | null;
  txStatus?: ConsignmentStatus;
  clientOutcome?: 'cancelled' | 'queued';
}) {
  const txConsignment = {
    id: 'c1',
    status: opts.txStatus ?? opts.initialStatus ?? ConsignmentStatus.in_transit,
  };
  const tx = {
    $queryRaw: jest.fn().mockResolvedValue(undefined),
    consignment: {
      findUniqueOrThrow: jest.fn().mockResolvedValue(txConsignment),
      update: jest.fn().mockImplementation(({ data }: { data: unknown }) => ({ id: 'c1', ...(data as object) })),
    },
  };
  const prisma = {
    consignment: {
      findUnique: jest.fn().mockResolvedValue({
        id: 'c1',
        status: opts.initialStatus ?? ConsignmentStatus.in_transit,
        awbNumber: opts.awbNumber === undefined ? 'AWB123' : opts.awbNumber,
      }),
      update: jest.fn().mockResolvedValue({ id: 'c1' }),
    },
    $transaction: jest.fn().mockImplementation((fn: (t: unknown) => unknown) => fn(tx)),
  };
  const client = {
    cancel: jest.fn().mockResolvedValue({ outcome: opts.clientOutcome ?? 'cancelled', raw: {} }),
  };
  const service = new ShippingService(prisma as never, {} as never, client as never, {} as never);
  return { service, prisma, tx, client };
}

describe('ShippingService#cancel — race safety against a concurrent delivery callback', () => {
  it('cancels normally when nothing changed underneath (AWB path)', async () => {
    const { service, tx, client } = serviceWith({ initialStatus: ConsignmentStatus.in_transit });

    const result = await service.cancel('c1', 'Kitchen closed early');

    expect(client.cancel).toHaveBeenCalledWith('AWB123', 'Kitchen closed early');
    expect(tx.$queryRaw).toHaveBeenCalled();
    expect(tx.consignment.update).toHaveBeenCalledWith({
      where: { id: 'c1' },
      data: expect.objectContaining({ status: ConsignmentStatus.cancelled, statusNote: 'Kitchen closed early' }),
    });
    expect((result as { status: ConsignmentStatus }).status).toBe(ConsignmentStatus.cancelled);
  });

  it('refuses with a conflict when ingest() delivered the parcel during the carrier round trip', async () => {
    // The plain read before the carrier call still sees `in_transit`;
    // by the time `finalizeCancel`'s locked re-read runs, a concurrent
    // `ingest()` has already advanced the row to `delivered`.
    const { service, tx } = serviceWith({
      initialStatus: ConsignmentStatus.in_transit,
      txStatus: ConsignmentStatus.delivered,
    });

    await expect(service.cancel('c1', 'Kitchen closed early')).rejects.toThrow(ConflictException);
    expect(tx.consignment.update).not.toHaveBeenCalled();
  });

  it('refuses with a conflict when the row raced to any other terminal state (e.g. returned)', async () => {
    const { service, tx } = serviceWith({
      initialStatus: ConsignmentStatus.in_transit,
      txStatus: ConsignmentStatus.returned,
    });

    await expect(service.cancel('c1', 'Kitchen closed early')).rejects.toThrow(ConflictException);
    expect(tx.consignment.update).not.toHaveBeenCalled();
  });

  it('cancels normally on the no-AWB path, still through the locked re-check', async () => {
    const { service, tx, client } = serviceWith({ initialStatus: ConsignmentStatus.pending, awbNumber: null });

    await service.cancel('c1', 'Never booked');

    expect(client.cancel).not.toHaveBeenCalled();
    expect(tx.$queryRaw).toHaveBeenCalled();
    expect(tx.consignment.update).toHaveBeenCalledWith({
      where: { id: 'c1' },
      data: expect.objectContaining({ status: ConsignmentStatus.cancelled, failureReason: 'Never booked' }),
    });
  });

  it('does not touch status on a "queued" carrier outcome, and so never enters the locked re-check', async () => {
    const { service, tx, prisma } = serviceWith({
      initialStatus: ConsignmentStatus.in_transit,
      clientOutcome: 'queued',
    });

    await service.cancel('c1', 'Kitchen closed early');

    expect(tx.consignment.update).not.toHaveBeenCalled();
    expect(prisma.consignment.update).toHaveBeenCalledWith({
      where: { id: 'c1' },
      data: { statusNote: 'Cancellation queued with the carrier: Kitchen closed early' },
    });
  });
});
