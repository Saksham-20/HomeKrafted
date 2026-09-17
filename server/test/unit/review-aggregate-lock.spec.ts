import { ReviewAggregatesService } from '../../src/reviews/review-aggregates.service';

/**
 * Finding [39]: `applyProduct`/`applyVendor` read the aggregate and then
 * write the denormalised `rating`/`reviewCount` column with no isolation
 * override and no per-target locking. Under Postgres's default READ
 * COMMITTED, two reviews written for the same target at once could both
 * read the aggregate before either write committed, and whichever
 * `update` committed last silently overwrote the other's count with a
 * stale one.
 *
 * The fix takes a `SELECT ... FOR UPDATE` row lock on the target
 * (`Product` and/or `Vendor`) before the aggregate read, inside a
 * transaction — opening one itself when the caller doesn't already
 * supply one, since the lock only holds for the life of a transaction.
 */

function dbStub() {
  return {
    $queryRaw: jest.fn().mockResolvedValue(undefined),
    product: {
      findUnique: jest.fn().mockResolvedValue({ vendorId: 'vd-1' }),
      update: jest.fn().mockResolvedValue({}),
      findMany: jest.fn().mockResolvedValue([{ id: 'pr-1' }]),
    },
    review: {
      aggregate: jest.fn().mockResolvedValue({ _avg: { rating: 4.6 }, _count: { _all: 3 } }),
    },
    vendor: { update: jest.fn().mockResolvedValue({}) },
    seller: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
  };
}

function serviceWith() {
  const tx = dbStub();
  const prisma = {
    $transaction: jest.fn().mockImplementation((fn: (t: unknown) => unknown) => fn(tx)),
  };
  const service = new ReviewAggregatesService(prisma as never);
  return { service, prisma, tx };
}

describe('ReviewAggregatesService.recompute — row-locked against the concurrent-write race', () => {
  it('opens its own transaction and locks both the Product and Vendor rows before reading/writing the aggregate, when no tx is supplied', async () => {
    const { service, prisma, tx } = serviceWith();

    await service.recompute('product', 'pr-1');

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    // Locked before either aggregate write: Product first (this target),
    // then Vendor (the rollup) — the fixed lock order that keeps two
    // concurrent recomputes from deadlocking on each other.
    const queries = (tx.$queryRaw as jest.Mock).mock.calls.map((call) => String(call[0]));
    expect(queries[0]).toContain('Product');
    expect(queries[1]).toContain('Vendor');
    expect(tx.product.update).toHaveBeenCalledWith({
      where: { id: 'pr-1' },
      data: { rating: 4.6, reviewCount: 3 },
    });
    expect(tx.vendor.update).toHaveBeenCalledWith({
      where: { id: 'vd-1' },
      data: { rating: 4.6, reviewCount: 3 },
    });
  });

  it('joins the caller-supplied transaction instead of opening its own', async () => {
    const { service, prisma } = serviceWith();
    const suppliedTx = dbStub();

    await service.recompute('vendor', 'vd-1', suppliedTx as never);

    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(suppliedTx.$queryRaw).toHaveBeenCalledTimes(1);
    expect(String((suppliedTx.$queryRaw as jest.Mock).mock.calls[0][0])).toContain('Vendor');
    expect(suppliedTx.vendor.update).toHaveBeenCalledWith({
      where: { id: 'vd-1' },
      data: { rating: 4.6, reviewCount: 3 },
    });
  });

  it('does nothing for a service target — no denormalised column to keep in step', async () => {
    const { service, tx } = serviceWith();

    await service.recompute('service', 'sv-1');

    expect(tx.$queryRaw).not.toHaveBeenCalled();
    expect(tx.product.update).not.toHaveBeenCalled();
    expect(tx.vendor.update).not.toHaveBeenCalled();
  });
});
