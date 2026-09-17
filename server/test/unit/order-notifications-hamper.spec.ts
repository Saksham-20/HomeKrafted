import { OrderNotificationsService } from '../../src/orders/order-notifications.service';

/**
 * A hamper `OrderItem` carries `hamperId` and a NULL `productId` — the
 * same product-or-hamper XOR `resolve-cart-line.ts` resolves for pricing.
 * `notifyHomeKraftersOfNewOrder`/`notifyHomeKraftersOfCancellation`
 * (finding [10]) resolved a line's seller through `item.product?.vendor
 * ?.seller` alone, so every hamper line's `item.product` was always null
 * and its maker was silently skipped — a HomeKrafter whose order came in
 * through a hamper was never told it had arrived or that it was
 * cancelled.
 */

function orderWith(items: unknown[]) {
  return { id: 'ord-1', orderNumber: 'HK-2001', items };
}

function serviceWith(order: unknown) {
  const deliver = jest.fn().mockResolvedValue(undefined);
  const prisma = { order: { findUnique: jest.fn().mockResolvedValue(order) } };
  const config = { get: jest.fn().mockReturnValue('https://homekrafted.in') };
  const service = new OrderNotificationsService(prisma as never, { deliver } as never, config as never);
  return { service, deliver };
}

const PRODUCT_LINE = {
  name: 'Ragi Cookies',
  quantity: 2,
  product: { vendor: { seller: { userId: 'seller-a' } } },
  hamper: null,
};

const HAMPER_LINE = {
  name: 'Diwali Gift Hamper',
  quantity: 1,
  product: null,
  hamper: { items: [{ product: { vendor: { seller: { userId: 'seller-b' } } } }] },
};

describe('OrderNotificationsService — hamper lines resolve a maker too (finding [10])', () => {
  it('notifyHomeKraftersOfNewOrder tells both the product-line maker and the hamper-line maker', async () => {
    const { service, deliver } = serviceWith(orderWith([PRODUCT_LINE, HAMPER_LINE]));

    await service.notifyHomeKraftersOfNewOrder('ord-1');

    expect(deliver).toHaveBeenCalledTimes(2);
    const userIds = deliver.mock.calls.map((call) => (call[0] as { userId: string }).userId).sort();
    expect(userIds).toEqual(['seller-a', 'seller-b']);
    const hamperCall = deliver.mock.calls.find((call) => (call[0] as { userId: string }).userId === 'seller-b')![0] as {
      body: string;
    };
    expect(hamperCall.body).toContain('Diwali Gift Hamper');
  });

  it('notifyHomeKraftersOfCancellation tells both makers, not only the direct product line', async () => {
    const { service, deliver } = serviceWith(orderWith([PRODUCT_LINE, HAMPER_LINE]));

    await service.notifyHomeKraftersOfCancellation('ord-1');

    expect(deliver).toHaveBeenCalledTimes(2);
    const userIds = deliver.mock.calls.map((call) => (call[0] as { userId: string }).userId).sort();
    expect(userIds).toEqual(['seller-a', 'seller-b']);
  });

  it('skips a line with neither a product nor a resolvable hamper maker, without throwing', async () => {
    const { service, deliver } = serviceWith(orderWith([{ name: 'Ghost line', quantity: 1, product: null, hamper: null }]));

    await service.notifyHomeKraftersOfNewOrder('ord-1');

    expect(deliver).not.toHaveBeenCalled();
  });

  it('an order made up only of a hamper still notifies its maker', async () => {
    const { service, deliver } = serviceWith(orderWith([HAMPER_LINE]));

    await service.notifyHomeKraftersOfNewOrder('ord-1');

    expect(deliver).toHaveBeenCalledTimes(1);
    expect((deliver.mock.calls[0][0] as { userId: string }).userId).toBe('seller-b');
  });
});
