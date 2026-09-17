import { DeliveryOrderReconcileService } from '../../src/rider/delivery-order-reconcile.service';

/**
 * `reconcile()` guards its `Order.status` write with a compare-and-set on
 * the status it just read (`updateMany({ where: { id, status } })`),
 * the same shape every transition in `RiderJobsService`/`DispatchService`
 * uses. Without it, two `DeliveryJob`s on the same multi-vendor order
 * both finishing around the same moment each pass the rank check against
 * the same stale `order.status` and both apply the update — double-firing
 * the buyer notification.
 */

function serviceWith(opts: { orderStatus: string; updateCount: number }) {
  const update = jest.fn().mockResolvedValue({ count: opts.updateCount });
  const prisma = {
    deliveryJob: {
      findMany: jest.fn().mockResolvedValue([
        { vendorId: 'v1', addressId: 'a1', status: 'delivered' },
      ]),
    },
    orderItem: {
      findMany: jest.fn().mockResolvedValue([
        { addressId: 'a1', product: { vendorId: 'v1' } },
      ]),
    },
    order: {
      findUnique: jest.fn().mockResolvedValue({ id: 'ord1', status: opts.orderStatus }),
      updateMany: update,
    },
  };
  const orderNotifications = { notifyBuyerOfStatus: jest.fn().mockResolvedValue(undefined) };
  const service = new DeliveryOrderReconcileService(prisma as never, orderNotifications as never);
  return { service, prisma, update, orderNotifications };
}

describe('DeliveryOrderReconcileService.reconcile — concurrent finish race', () => {
  it('guards the status write with a compare-and-set on the status it read', async () => {
    const { service, update } = serviceWith({ orderStatus: 'shipped', updateCount: 1 });

    await service.reconcile('ord1');

    expect(update).toHaveBeenCalledWith({
      where: { id: 'ord1', status: 'shipped' },
      data: expect.objectContaining({ status: 'delivered' }),
    });
  });

  it('never notifies the buyer when the compare-and-set loses the race', async () => {
    // A sibling job's reconcile() already moved the order past `shipped`
    // between this call's read and its write — the guarded update
    // matches zero rows.
    const { service, orderNotifications, update } = serviceWith({ orderStatus: 'shipped', updateCount: 0 });

    await service.reconcile('ord1');

    expect(update).toHaveBeenCalled();
    expect(orderNotifications.notifyBuyerOfStatus).not.toHaveBeenCalled();
  });

  it('notifies exactly once when the compare-and-set wins', async () => {
    const { service, orderNotifications } = serviceWith({ orderStatus: 'shipped', updateCount: 1 });

    await service.reconcile('ord1');

    expect(orderNotifications.notifyBuyerOfStatus).toHaveBeenCalledTimes(1);
    expect(orderNotifications.notifyBuyerOfStatus).toHaveBeenCalledWith('ord1', 'delivered');
  });
});
