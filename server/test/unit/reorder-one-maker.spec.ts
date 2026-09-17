import { OrdersService } from '../../src/orders/orders.service';

/**
 * `reorder()` writes straight to `CartItem` via `this.prisma`, bypassing
 * `CartService.addItem` entirely — finding [7] was that it therefore never
 * called `assertSameMaker`, so reordering a past order could deterministically
 * rebuild a basket spanning two vendors, which a fresh `POST /cart/items`
 * call could never do. The fix treats a maker conflict exactly like every
 * other reason a line can't be re-added: skip it and say why, rather than
 * silently merging two kitchens into one basket.
 */

const PRODUCT_A = {
  id: 'p-a',
  name: 'Ragi Cookies',
  moderationStatus: 'active',
  vendorId: 'vd1',
  kind: 'craft',
  isAvailable: true,
  weightOptions: [{ sku: 'sku-a', stock: 10 }],
};

const PRODUCT_B = {
  id: 'p-b',
  name: 'Terracotta Diya',
  moderationStatus: 'active',
  vendorId: 'vd2',
  kind: 'craft',
  isAvailable: true,
  weightOptions: [{ sku: 'sku-b', stock: 10 }],
};

function serviceWith() {
  const order = {
    id: 'ord-1',
    userId: 'u1',
    items: [
      { productId: 'p-a', sku: 'sku-a', quantity: 1, name: 'Ragi Cookies' },
      { productId: 'p-b', sku: 'sku-b', quantity: 1, name: 'Terracotta Diya' },
    ],
  };

  const created = jest.fn().mockResolvedValue({});
  // Sequenced to mirror what a real cart would answer at each point in the
  // loop: item A's `assertSameMaker` (2 calls — product check, hamper
  // check) sees an empty cart, then its own "existing line?" lookup also
  // comes back empty. Item B's `assertSameMaker` product check then finds
  // the line item A just wrote, from a different vendor.
  const findFirst = jest
    .fn()
    .mockResolvedValueOnce(null) // item A — assertSameMaker: product check
    .mockResolvedValueOnce(null) // item A — assertSameMaker: hamper check
    .mockResolvedValueOnce(null) // item A — existing cart line?
    .mockResolvedValueOnce({ product: { vendorId: 'vd1', vendor: { name: 'Anjali Home Bakes' } } }); // item B — assertSameMaker: product check

  const prisma = {
    order: { findUnique: jest.fn().mockResolvedValue(order) },
    cart: { findUnique: jest.fn().mockResolvedValue({ id: 'c1', userId: 'u1' }), update: jest.fn() },
    product: {
      findUnique: jest
        .fn()
        .mockImplementation(({ where: { id } }: { where: { id: string } }) =>
          Promise.resolve(id === 'p-a' ? PRODUCT_A : PRODUCT_B),
        ),
    },
    cartItem: { findFirst, create: created, update: jest.fn() },
  };

  const settings = { get: jest.fn().mockResolvedValue({ foodOrdersOpen: true }) };
  const service = new OrdersService(
    prisma as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    settings as never,
  );
  return { service, created };
}

describe('OrdersService#reorder — one basket, one maker (finding [7])', () => {
  it('adds the first vendor’s line and skips the second, naming the conflict', async () => {
    const { service, created } = serviceWith();

    const result = await service.reorder('u1', 'ord-1');

    expect(result.added).toEqual([{ name: 'Ragi Cookies', quantity: 1 }]);
    expect(result.skipped).toEqual([
      { name: 'Terracotta Diya', reason: 'From a different maker than what is already in your basket' },
    ]);
    // Only the first vendor's line was actually written.
    expect(created).toHaveBeenCalledTimes(1);
  });
});
