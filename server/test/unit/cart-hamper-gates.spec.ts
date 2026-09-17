import { BadRequestException, ConflictException } from '@nestjs/common';
import { CartService } from '../../src/cart/cart.service';
import { FOOD_COMING_SOON } from '../../src/common/food-orders';

/**
 * `addHamperItem`'s own comment claims "every check `addItem` has, or it
 * is the way round them" — finding [8] was that it did not: it checked
 * `isPurchasable` per line and nothing else, so a hamper could bundle a
 * food product while `foodOrdersOpen` is off, or a quantity beyond a
 * product's stock, neither of which `addItem` would ever let through.
 */
function serviceWith(opts: {
  foodOrdersOpen?: boolean;
  product?: Record<string, unknown>;
  maxItems?: number;
}) {
  const product = opts.product ?? {
    name: 'Ragi Cookies',
    moderationStatus: 'active',
    vendorId: 'vd1',
    kind: 'craft',
    defaultWeightSku: 'sku-1',
    weightOptions: [{ sku: 'sku-1', stock: 5 }],
    vendor: { name: 'Anjali Home Bakes' },
  };
  const prisma = {
    hamperBox: {
      findUnique: jest.fn().mockResolvedValue({ id: 'box1', name: 'Classic Box', maxItems: opts.maxItems ?? 10, price: 100 }),
    },
    product: { findUnique: jest.fn().mockResolvedValue(product) },
    // Only reached once the gates pass — not what these tests are about,
    // but present so a passing case doesn't crash on a missing mock.
    address: { findUnique: jest.fn() },
    cart: { findUnique: jest.fn().mockResolvedValue({ id: 'c1', userId: 'u1' }), update: jest.fn() },
    $transaction: jest.fn().mockImplementation((fn: (t: unknown) => unknown) =>
      fn({
        $queryRaw: jest.fn().mockResolvedValue(undefined),
        cartItem: { findFirst: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue({}) },
        hamper: { create: jest.fn().mockResolvedValue({ id: 'hp1' }) },
      }),
    ),
  };
  const settings = { get: jest.fn().mockResolvedValue({ foodOrdersOpen: opts.foodOrdersOpen ?? true }) };
  const service = new CartService(prisma as never, settings as never);
  jest.spyOn(service, 'getCart').mockResolvedValue({} as never);
  return { service, prisma };
}

describe('CartService#addHamperItem — every check addItem has (finding [8])', () => {
  it('refuses a food line while food orders are coming soon', async () => {
    const { service } = serviceWith({
      foodOrdersOpen: false,
      product: {
        name: 'Thali',
        moderationStatus: 'active',
        vendorId: 'vd1',
        kind: 'food',
        defaultWeightSku: 'sku-1',
        weightOptions: [{ sku: 'sku-1', stock: 5 }],
        vendor: { name: 'Sharma Kitchen' },
      },
    });
    const attempt = service.addHamperItem('u1', {
      boxId: 'box1',
      items: [{ productId: 'p1', quantity: 1 }],
    } as never);
    await expect(attempt).rejects.toBeInstanceOf(ConflictException);
    await attempt.catch((err: ConflictException) => {
      expect((err.getResponse() as { code: string }).code).toBe(FOOD_COMING_SOON);
    });
  });

  it('still bundles a craft line while food orders are coming soon', async () => {
    const { service, prisma } = serviceWith({ foodOrdersOpen: false });
    await service.addHamperItem('u1', {
      boxId: 'box1',
      items: [{ productId: 'p1', quantity: 1 }],
    } as never);
    expect(prisma.$transaction).toHaveBeenCalled();
  });

  it('refuses a quantity beyond the product’s stock', async () => {
    const { service } = serviceWith({
      product: {
        name: 'Ragi Cookies',
        moderationStatus: 'active',
        vendorId: 'vd1',
        kind: 'craft',
        defaultWeightSku: 'sku-1',
        weightOptions: [{ sku: 'sku-1', stock: 2 }],
        vendor: { name: 'Anjali Home Bakes' },
      },
    });
    const attempt = service.addHamperItem('u1', {
      boxId: 'box1',
      items: [{ productId: 'p1', quantity: 5 }],
    } as never);
    await expect(attempt).rejects.toBeInstanceOf(BadRequestException);
  });

  it('allows a quantity the stock actually covers', async () => {
    const { service, prisma } = serviceWith({});
    await service.addHamperItem('u1', {
      boxId: 'box1',
      items: [{ productId: 'p1', quantity: 3 }],
    } as never);
    expect(prisma.$transaction).toHaveBeenCalled();
  });
});
