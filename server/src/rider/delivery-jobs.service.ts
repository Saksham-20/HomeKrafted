import * as crypto from 'crypto';
import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { DeliveryJob, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { distanceKm } from '../common/geo';
import { zoneFor } from './zones';
import { ROAD_FACTOR } from './dispatch';
import { allocateCodAmount } from './cod-split';
import { payFor } from './rider-pay';
import { RiderSettingsService } from './rider-settings.service';

/**
 * Mints the `DeliveryJob` row(s) one kitchen's lines of one order need —
 * one job per (vendor, address) the same way `ShippingService`'s
 * `ensureConsignments` groups a `Consignment`, and for the same reason: a
 * parcel is one rider, one pickup, one drop, and a gift-recipient line to
 * a second address is a second parcel.
 *
 * **Not wired to the seller "packed" flow yet.** That is W1 — this
 * service exists so `POST /admin/deliveries` can dispatch a kitchen's
 * parcel by hand while the automatic hook is still to be built.
 */
@Injectable()
export class DeliveryJobsService {
  private readonly logger = new Logger(DeliveryJobsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: RiderSettingsService,
  ) {}

  async createForOrder(orderId: string, vendorId: string): Promise<DeliveryJob[]> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { items: { include: { product: { select: { vendorId: true } } } } },
    });
    if (!order) throw new NotFoundException('Order not found');

    const vendor = await this.prisma.vendor.findUnique({ where: { id: vendorId } });
    if (!vendor) throw new NotFoundException('Vendor not found');

    const vendorItems = order.items.filter((item) => item.product?.vendorId === vendorId);
    if (vendorItems.length === 0) {
      throw new BadRequestException('This order has no lines from this kitchen.');
    }

    // This vendor's own share of the order's collectible cash (D9's ledger
    // is what actually gets paid; this is only what the rider is told to
    // collect). Split across *every* vendor on the order first, by each
    // vendor's own line subtotal — a two-kitchen COD order should not have
    // one rider collecting the whole thing.
    let vendorCodShare = 0;
    if (order.paymentMethod === 'cod') {
      const codTotal = Number(order.total) - Number(order.walletApplied);
      const subtotalByVendor = new Map<string, number>();
      for (const item of order.items) {
        const vid = item.product?.vendorId;
        if (!vid) continue;
        subtotalByVendor.set(vid, (subtotalByVendor.get(vid) ?? 0) + Number(item.price) * item.quantity);
      }
      const sortedVendorIds = [...subtotalByVendor.keys()].sort();
      const vendorShares = allocateCodAmount(
        sortedVendorIds.map((vid) => ({ key: vid, subtotal: subtotalByVendor.get(vid) as number })),
        codTotal,
      );
      vendorCodShare = vendorShares.get(vendorId) ?? 0;
    }

    // This vendor's own lines may still span more than one address (a
    // gift sent to somebody else). Split this vendor's own COD share
    // across its own address groups the same way.
    const addressIds = [...new Set(vendorItems.map((item) => item.addressId))].sort();
    const subtotalByAddress = addressIds.map((addressId) => ({
      key: addressId,
      subtotal: vendorItems
        .filter((item) => item.addressId === addressId)
        .reduce((sum, item) => sum + Number(item.price) * item.quantity, 0),
    }));
    const codByAddress = allocateCodAmount(subtotalByAddress, vendorCodShare);

    const zones = await this.prisma.deliveryZone.findMany({ where: { isActive: true } });
    const zone = zoneFor({ lat: vendor.lat, lng: vendor.lng }, zones);

    const jobs: DeliveryJob[] = [];
    for (const addressId of addressIds) {
      const address = await this.prisma.address.findUnique({ where: { id: addressId } });
      if (!address) continue;
      if (address.lat === null || address.lng === null) {
        throw new BadRequestException(
          'This address has no map pin; ask the buyer to pin it or deliver by hand.',
        );
      }

      const rawKm = distanceKm({ lat: vendor.lat, lng: vendor.lng }, { lat: address.lat, lng: address.lng });
      const roadKm = Math.round(rawKm * ROAD_FACTOR * 10) / 10;
      const codAmount = codByAddress.get(addressId) ?? 0;
      // Pay is quoted before anybody accepts: an offer that hides what it
      // pays is one a rider can only accept blind. This is the no-wait
      // figure; `RiderJobsService.pickedUp` recomputes it with the real
      // wait, which can only add to it.
      const quote = payFor({ distanceKm: roadKm, waitMinutes: 0, settings: await this.settings.get() });

      try {
        const job = await this.prisma.deliveryJob.create({
          data: {
            jobNumber: mintJobNumber(),
            orderId,
            vendorId,
            addressId,
            zoneId: zone?.id,
            pickupLat: vendor.lat,
            pickupLng: vendor.lng,
            dropLat: address.lat,
            dropLng: address.lng,
            distanceKm: roadKm,
            codAmount: codAmount > 0 ? codAmount : null,
            basePay: quote.basePay / 100,
            distancePay: quote.distancePay / 100,
            waitPay: 0,
            totalPay: quote.totalPay / 100,
            deliveryOtp: mintOtp(),
          },
        });
        jobs.push(job);
      } catch (err) {
        // Same idempotency shape as `ShippingService.ensureConsignments`:
        // two callers racing to create the same (order, vendor, address)
        // job both find nothing, both insert, and the loser hits the
        // `@@unique` constraint rather than a lost job — the row it was
        // going to create is the row that now exists.
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
          const existing = await this.prisma.deliveryJob.findUniqueOrThrow({
            where: { orderId_vendorId_addressId: { orderId, vendorId, addressId } },
          });
          jobs.push(existing);
        } else {
          throw err;
        }
      }
    }

    return jobs;
  }
}

function mintJobNumber(): string {
  const now = new Date();
  const yy = String(now.getFullYear()).slice(-2);
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const rand = crypto.randomInt(0, 36 ** 5).toString(36).toUpperCase().padStart(5, '0');
  return `HKD-${yy}${mm}${dd}-${rand}`;
}

/** 4 random digits, crypto — the buyer's fallback proof of delivery (§2.3). */
function mintOtp(): string {
  return String(crypto.randomInt(0, 10000)).padStart(4, '0');
}
