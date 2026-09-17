import { AdminCatalogService } from '../../src/admin/catalog.service';

/**
 * Finding [38]: `moderateReview()` hid/un-hid a review and recomputed the
 * denormalised rating aggregate as two separate, unwrapped writes —
 * unlike `ReviewsService.create()`, which explicitly transacts the same
 * pair for this exact reason. A failure between the two steps (or a
 * process crash) could leave `hidden` persisted while `Product.rating`/
 * `Vendor.rating` still counted (or wrongly omitted) the review.
 *
 * The fix wraps `review.update` + `reviewAggregates.recompute` in one
 * `$transaction`, mirroring `ReviewsService.create()`.
 */

function reviewRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'rev-1',
    targetType: 'product',
    targetId: 'pr-1',
    userName: 'Asha',
    rating: 1,
    title: 'Not great',
    body: 'Arrived late',
    createdAt: new Date('2026-09-01T00:00:00.000Z'),
    helpfulCount: 0,
    verifiedPurchase: true,
    sellerReplyBody: null,
    sellerReplyCreatedAt: null,
    flagged: false,
    hidden: true,
    ...overrides,
  };
}

function serviceWith(opts: { recomputeThrows?: unknown } = {}) {
  const tx = {
    review: { update: jest.fn().mockResolvedValue(reviewRow()) },
  };
  const prisma = {
    review: { findUnique: jest.fn().mockResolvedValue(reviewRow({ hidden: false })) },
    $transaction: jest.fn().mockImplementation((fn: (t: unknown) => unknown) => fn(tx)),
  };
  const auditLog = { log: jest.fn().mockResolvedValue(undefined) };
  const reviewAggregates = {
    recompute: jest.fn().mockImplementation(() => {
      if (opts.recomputeThrows) return Promise.reject(opts.recomputeThrows);
      return Promise.resolve(undefined);
    }),
  };
  const service = new AdminCatalogService(
    prisma as never,
    auditLog as never,
    reviewAggregates as never,
    {} as never, // moderationNotifications — untouched by moderateReview
    {} as never, // dayMenus — untouched by moderateReview
    {} as never, // listings — untouched by moderateReview
    {} as never, // settings — untouched by moderateReview
  );
  return { service, prisma, tx, auditLog, reviewAggregates };
}

describe('AdminCatalogService.moderateReview — transacted with the aggregate recompute', () => {
  it('updates hidden and recomputes the aggregate inside the same transaction, joined via the supplied tx', async () => {
    const { service, prisma, tx, reviewAggregates, auditLog } = serviceWith();

    await service.moderateReview('admin-1', 'rev-1', true);

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.review.update).toHaveBeenCalledWith({ where: { id: 'rev-1' }, data: { hidden: true } });
    // The third argument being the transaction client (not undefined) is
    // what makes the recompute a participant in the same transaction
    // rather than a second, independent write.
    expect(reviewAggregates.recompute).toHaveBeenCalledWith('product', 'pr-1', tx);
    expect(auditLog.log).toHaveBeenCalledWith(
      expect.objectContaining({ actorId: 'admin-1', action: 'review.hide', targetType: 'Review', targetId: 'rev-1' }),
    );
  });

  it('never writes an audit row when the recompute inside the transaction fails', async () => {
    const boom = new Error('deadlock detected');
    const { service, auditLog } = serviceWith({ recomputeThrows: boom });

    await expect(service.moderateReview('admin-1', 'rev-1', true)).rejects.toBe(boom);
    // No audit row for an action whose transaction never committed.
    expect(auditLog.log).not.toHaveBeenCalled();
  });
});
