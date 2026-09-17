import { ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ReviewsService } from '../../src/reviews/reviews.service';
import { CreateReviewDto } from '../../src/reviews/dto/create-review.dto';

/**
 * Two concurrent `create()` calls for the same user/target — finding
 * [40]. The duplicate-review pre-check (`review.findUnique`) and the
 * `tx.review.create` are two separate, non-transactional steps: a second
 * request racing the first passes the pre-check (nothing has been written
 * yet) and then hits `@@unique([userId, targetType, targetId])` on
 * `create`, which used to surface as a raw, uncaught
 * `PrismaClientKnownRequestError` (P2002) — a bare 500 from
 * `AllExceptionsFilter` — instead of the same actionable `ConflictException`
 * the pre-check throws in the common case.
 */

function p2002(): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError(
    'Unique constraint failed on the fields: (`userId`,`targetType`,`targetId`)',
    { code: 'P2002', clientVersion: '5.0.0', meta: { target: ['userId', 'targetType', 'targetId'] } },
  );
}

function serviceWith(options: { createThrows?: unknown } = {}) {
  const tx = {
    review: {
      create: jest.fn().mockImplementation(() => {
        if (options.createThrows) return Promise.reject(options.createThrows);
        return Promise.resolve({
          id: 'rev-1',
          targetType: 'product',
          targetId: 'pr-1',
          userName: 'Asha',
          rating: 5,
          title: 'Lovely',
          body: 'Great pickle',
          createdAt: new Date('2026-09-17T00:00:00.000Z'),
          helpfulCount: 0,
          verifiedPurchase: true,
          sellerReplyBody: null,
          sellerReplyCreatedAt: null,
          flagged: false,
          hidden: false,
        });
      }),
    },
  };
  const prisma = {
    user: { findUnique: jest.fn().mockResolvedValue({ id: 'u1', name: 'Asha' }) },
    product: { findUnique: jest.fn().mockResolvedValue({ id: 'pr-1' }) },
    vendor: { findUnique: jest.fn().mockResolvedValue({ id: 'vd-1' }) },
    laundryService: { findUnique: jest.fn().mockResolvedValue({ id: 'sv-1' }) },
    orderItem: { count: jest.fn().mockResolvedValue(1) },
    laundryBookingLine: { count: jest.fn().mockResolvedValue(0) },
    // The pre-check finds nothing — this is exactly the race: the other
    // request's row does not exist yet when this one checks.
    review: { findUnique: jest.fn().mockResolvedValue(null) },
    $transaction: jest.fn().mockImplementation((fn: (t: unknown) => unknown) => fn(tx)),
  };
  const aggregates = { recompute: jest.fn().mockResolvedValue(undefined) };
  const delivery = { deliver: jest.fn().mockResolvedValue([]) };
  const service = new ReviewsService(prisma as never, aggregates as never, delivery as never);
  return { service, prisma, tx, aggregates };
}

const dto: CreateReviewDto = { targetType: 'product', targetId: 'pr-1', rating: 5, title: 'Lovely', body: 'Great pickle' };

describe('ReviewsService.create — the duplicate-review P2002 race', () => {
  it('translates a unique-constraint violation on create into a 409, not a raw 500', async () => {
    const { service, aggregates } = serviceWith({ createThrows: p2002() });

    await expect(service.create('u1', dto)).rejects.toBeInstanceOf(ConflictException);
    // The aggregate must not have been touched for a review that never landed.
    expect(aggregates.recompute).not.toHaveBeenCalled();
  });

  it('still lets an unrelated database error propagate unmodified', async () => {
    const boom = new Error('connection lost');
    const { service } = serviceWith({ createThrows: boom });

    await expect(service.create('u1', dto)).rejects.toBe(boom);
  });

  it('creates normally when there is no collision', async () => {
    const { service } = serviceWith();

    const review = await service.create('u1', dto);
    expect(review.id).toBe('rev-1');
  });
});
