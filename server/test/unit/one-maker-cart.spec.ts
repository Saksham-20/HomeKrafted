import { ConflictException } from '@nestjs/common';
import {
  CART_OTHER_MAKER,
  assertSameMaker,
  assertSingleMakerCart,
  otherMakerConflict,
} from '../../src/cart/one-maker-cart';

/**
 * The refusal a client acts on. It is the whole contract between the
 * server's rule and the "empty my basket and start again" choice the
 * shopper is offered, so the shape is pinned rather than assumed.
 */
describe('one basket, one maker', () => {
  it('carries a code a client can branch on', () => {
    const conflict = otherMakerConflict('vd3', 'Sharma Kitchen');
    expect(conflict.code).toBe(CART_OTHER_MAKER);
    expect(conflict.vendorId).toBe('vd3');
    expect(conflict.vendorName).toBe('Sharma Kitchen');
  });

  it('names the maker already in the basket, because the code alone is not a sentence', () => {
    // "You already have items from another maker" is not actionable; a
    // client that does not know the code shows this message as-is.
    const { message } = otherMakerConflict('vd3', 'Sharma Kitchen');
    expect(message).toContain('Sharma Kitchen');
    expect(message).not.toContain('vd3');
    expect(message).not.toContain('vendorId');
  });

  it('says the way out, not only the problem', () => {
    const { message } = otherMakerConflict('vd3', 'Sharma Kitchen');
    expect(message.toLowerCase()).toContain('empty your basket');
  });
});

/** A stub `db` (Prisma client or transaction client — `assertSameMaker`/`assertSingleMakerCart` take either) whose `cartItem.findFirst` answers in the order the calls are queued. */
function dbWith(findFirstQueue: unknown[] = [], findManyResult: unknown[] = []) {
  const findFirst = jest.fn();
  for (const result of findFirstQueue) findFirst.mockResolvedValueOnce(result);
  return {
    cartItem: {
      findFirst,
      findMany: jest.fn().mockResolvedValue(findManyResult),
    },
  };
}

describe('assertSameMaker', () => {
  it('lets anything into an empty cart', async () => {
    const db = dbWith([null, null]);
    await expect(assertSameMaker(db as never, 'cart1', 'vd1')).resolves.toBeUndefined();
  });

  it('refuses a product from a different maker than an existing product line', async () => {
    const db = dbWith([{ product: { vendorId: 'vd3', vendor: { name: 'Sharma Kitchen' } } }]);
    const attempt = assertSameMaker(db as never, 'cart1', 'vd1');
    await expect(attempt).rejects.toBeInstanceOf(ConflictException);
    await attempt.catch((err: ConflictException) => {
      expect((err.getResponse() as { code: string; vendorName: string }).vendorName).toBe('Sharma Kitchen');
    });
  });

  it('refuses a product from a different maker than an existing hamper line', async () => {
    // The first `findFirst` (the plain-product check) finds nothing; the
    // second (the hamper check) is where a hamper's maker lives.
    const db = dbWith([
      null,
      { hamper: { items: [{ product: { vendorId: 'vd3', vendor: { name: 'Sharma Kitchen' } } }] } },
    ]);
    await expect(assertSameMaker(db as never, 'cart1', 'vd1')).rejects.toBeInstanceOf(ConflictException);
  });
});

describe('assertSingleMakerCart — the checkout-time backstop', () => {
  it('passes a cart that only ever held one maker', async () => {
    const db = dbWith(
      [],
      [
        { product: { vendorId: 'vd1', vendor: { name: 'Anjali Home Bakes' } }, hamper: null },
        { product: { vendorId: 'vd1', vendor: { name: 'Anjali Home Bakes' } }, hamper: null },
      ],
    );
    await expect(assertSingleMakerCart(db as never, 'cart1')).resolves.toBeUndefined();
  });

  it('refuses a cart that somehow reached two makers', async () => {
    const db = dbWith(
      [],
      [
        { product: { vendorId: 'vd1', vendor: { name: 'Anjali Home Bakes' } }, hamper: null },
        { product: { vendorId: 'vd3', vendor: { name: 'Sharma Kitchen' } }, hamper: null },
      ],
    );
    const attempt = assertSingleMakerCart(db as never, 'cart1');
    await expect(attempt).rejects.toBeInstanceOf(ConflictException);
    await attempt.catch((err: ConflictException) => {
      expect((err.getResponse() as { vendorName: string }).vendorName).toBe('Anjali Home Bakes');
    });
  });

  it('reads a hamper line’s maker off its first product, not `product` directly', async () => {
    const db = dbWith(
      [],
      [
        { product: { vendorId: 'vd1', vendor: { name: 'Anjali Home Bakes' } }, hamper: null },
        {
          product: null,
          hamper: { items: [{ product: { vendorId: 'vd3', vendor: { name: 'Sharma Kitchen' } } }] },
        },
      ],
    );
    await expect(assertSingleMakerCart(db as never, 'cart1')).rejects.toBeInstanceOf(ConflictException);
  });
});
