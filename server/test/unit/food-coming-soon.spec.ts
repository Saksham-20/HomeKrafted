import { ConflictException } from '@nestjs/common';
import { CartService } from '../../src/cart/cart.service';
import { FOOD_COMING_SOON } from '../../src/common/food-orders';

/**
 * Food is browsable but not buyable while `foodOrdersOpen` is off. The
 * buttons hide on the web; this is the rule the API itself holds, because
 * the native app and anybody with a token reach the same route.
 */
function cartServiceWith(kind: 'food' | 'craft', foodOrdersOpen: boolean) {
  const created = jest.fn().mockResolvedValue({});
  const prisma = {
    cart: { findUnique: jest.fn().mockResolvedValue({ id: 'c1', userId: 'u1' }), update: jest.fn() },
    product: {
      findUnique: jest.fn().mockResolvedValue({
        id: 'p1',
        kind,
        vendorId: 'v1',
        moderationStatus: 'active',
        weightOptions: [{ sku: 's1', stock: 10 }],
      }),
    },
    cartItem: { findFirst: jest.fn().mockResolvedValue(null), create: created, findMany: jest.fn().mockResolvedValue([]) },
    hamper: { findFirst: jest.fn().mockResolvedValue(null) },
  };
  const settings = { get: jest.fn().mockResolvedValue({ foodOrdersOpen }) };
  const service = new CartService(prisma as never, settings as never);
  // The basket read after a successful add is not what these tests are about.
  jest.spyOn(service, 'getCart').mockResolvedValue({} as never);
  jest.spyOn(service as unknown as { assertSameMaker: () => Promise<void> }, 'assertSameMaker').mockResolvedValue();
  return { service, created };
}

describe('adding to the cart while food is coming soon', () => {
  it('refuses a food listing with FOOD_COMING_SOON and writes nothing', async () => {
    const { service, created } = cartServiceWith('food', false);
    const attempt = service.addItem('u1', { productId: 'p1', sku: 's1', quantity: 1 });
    await expect(attempt).rejects.toBeInstanceOf(ConflictException);
    await attempt.catch((err: ConflictException) => {
      expect((err.getResponse() as { code: string }).code).toBe(FOOD_COMING_SOON);
    });
    expect(created).not.toHaveBeenCalled();
  });

  it('still sells gifts', async () => {
    const { service, created } = cartServiceWith('craft', false);
    await service.addItem('u1', { productId: 'p1', sku: 's1', quantity: 1 });
    expect(created).toHaveBeenCalled();
  });

  it('sells food again once the switch is back on', async () => {
    const { service, created } = cartServiceWith('food', true);
    await service.addItem('u1', { productId: 'p1', sku: 's1', quantity: 1 });
    expect(created).toHaveBeenCalled();
  });
});
