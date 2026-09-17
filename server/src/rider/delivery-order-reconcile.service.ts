import { Injectable } from '@nestjs/common';
import { OrderStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { OrderNotificationsService } from '../orders/order-notifications.service';

/** Same rank table `ShippingService` uses — a fleet job may only ever push an order forward, never back over a state a person (or a different carrier) already put it in. */
const ORDER_RANK: Record<OrderStatus, number> = {
  pending_payment: 0,
  placed: 1,
  confirmed: 2,
  packed: 3,
  shipped: 4,
  delivered: 5,
  cancelled: 6,
  returned: 6,
};

/**
 * Pulls an order up to what its `DeliveryJob`s agree on —
 * `ShippingService.reconcileOrderStatus`'s exact shape, read from a
 * different carrier. Shared by `RiderJobsService` (a rider's own
 * picked-up/deliver) and `AdminDeliveriesService` (`override-deliver`),
 * rather than each keeping its own copy of the weakest-job/mixed-basket
 * rule.
 *
 * **The weakest job decides.** `shipped` once every job on the order is
 * at least `picked_up`, `delivered` once every job is `delivered` — never
 * the first one to get there, because `delivered` stamps `deliveredAt`,
 * starts the buyer's return window and is every kitchen's payout basis
 * (M15/M37).
 *
 * **An order line no `DeliveryJob` covers blocks the change entirely.**
 * A fleet-carried dish and a kitchen-carried craft item on one order is
 * the mixed-basket case `ShippingService`'s `courierOwnsOrder` exists
 * for — read here for the fleet instead of Shadowfax.
 */
@Injectable()
export class DeliveryOrderReconcileService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly orderNotifications: OrderNotificationsService,
  ) {}

  async reconcile(orderId: string): Promise<void> {
    const jobs = await this.prisma.deliveryJob.findMany({ where: { orderId } });
    if (jobs.length === 0) return;

    const uncovered = await this.uncoveredLineCount(orderId, jobs);
    if (uncovered > 0) return;

    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) return;
    if (order.status === 'cancelled' || order.status === 'returned') return;

    let next: OrderStatus | null = null;
    if (jobs.every((j) => j.status === 'delivered')) next = 'delivered';
    else if (jobs.every((j) => ['picked_up', 'at_drop', 'delivered'].includes(j.status))) next = 'shipped';
    if (!next) return;
    if (ORDER_RANK[next] <= ORDER_RANK[order.status]) return;

    // Guarded compare-and-set on the status this read saw — the same
    // shape every transition in `RiderJobsService`/`DispatchService` uses.
    // Two jobs on the same multi-vendor order finishing within the same
    // window (two riders completing their own drop at nearly the same
    // moment) would otherwise both pass the rank check above against the
    // same stale `order.status` and both apply the update, double-firing
    // the buyer notification.
    const result = await this.prisma.order.updateMany({
      where: { id: orderId, status: order.status },
      data: { status: next, ...(next === 'delivered' ? { deliveredAt: new Date() } : {}) },
    });
    if (result.count !== 1) return;
    void this.orderNotifications.notifyBuyerOfStatus(orderId, next);
  }

  private async uncoveredLineCount(orderId: string, jobs: { vendorId: string; addressId: string }[]): Promise<number> {
    const items = await this.prisma.orderItem.findMany({
      where: { orderId },
      include: { product: { select: { vendorId: true } } },
    });
    const covered = new Set(jobs.map((j) => `${j.vendorId}:${j.addressId}`));
    return items.filter((item) => {
      const vendorId = item.product?.vendorId;
      if (!vendorId) return true;
      return !covered.has(`${vendorId}:${item.addressId}`);
    }).length;
  }
}
