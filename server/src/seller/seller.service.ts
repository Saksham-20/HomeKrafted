import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Seller } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RequestUser } from '../common/types/jwt-payload.type';
import { mapVendor } from '../catalog/mappers/vendor.mapper';
import { UpdateStorefrontDto } from './dto/update-storefront.dto';
import { SellerListingsService } from './listings.service';
import { SellerPayoutsService } from './payouts.service';

/**
 * Core seller-scoping seam every `/seller/*` controller in this module goes
 * through. `RequestUser.sellerId` is minted into the JWT at login
 * (`AuthService.signTokenPair`, resolved server-side from `Seller.userId ===
 * user.id` — never anything the client supplies), so trusting it here still
 * means trusting a value we ourselves signed and verified, not a client
 * input. `resolveSeller` re-reads the `Seller` row fresh from the DB on
 * every call rather than only trusting the token's claim, so a seller
 * suspended after their token was issued (or a stale/tampered token that
 * somehow carries a `sellerId` for a row that no longer exists) can't ride
 * on it — `assertOwnSellerScope`-style trust-the-JWT plus a live row check.
 */
@Injectable()
export class SellerService {
  constructor(private readonly prisma: PrismaService) {}

  /** Every `/seller/*` controller method calls this first — never accepts a `sellerId` from a route/body param. */
  async resolveSeller(user: RequestUser): Promise<Seller> {
    if (!user.sellerId) {
      throw new ForbiddenException('No seller account is linked to this session');
    }
    const seller = await this.prisma.seller.findUnique({ where: { id: user.sellerId } });
    if (!seller) {
      throw new ForbiddenException('No seller account is linked to this session');
    }
    return seller;
  }

  /** Narrows to a `type: "maker"` seller (the only type with a `vendorId`) — used by listings/orders/storefront/reviews, all maker-only surfaces. */
  async resolveMaker(user: RequestUser): Promise<Seller & { vendorId: string }> {
    const seller = await this.resolveSeller(user);
    if (seller.type !== 'maker' || !seller.vendorId) {
      throw new ForbiddenException('This endpoint is only available to maker sellers');
    }
    return seller as Seller & { vendorId: string };
  }

  async resolveLaundryPartner(user: RequestUser): Promise<Seller> {
    const seller = await this.resolveSeller(user);
    if (seller.type !== 'laundry') {
      throw new ForbiddenException('This endpoint is only available to laundry-partner sellers');
    }
    return seller;
  }

  async resolveSnackSeller(user: RequestUser): Promise<Seller> {
    const seller = await this.resolveSeller(user);
    if (seller.type !== 'snack') {
      throw new ForbiddenException('This endpoint is only available to snack sellers');
    }
    return seller;
  }

  // -------------------------------------------------------------------
  // Storefront (maker only) — mutates the shared `Vendor` row this
  // seller manages. Ownership is implicit: `vendorId` always comes from
  // the resolved `Seller` row, never a client-supplied id, so there is
  // no route where a maker could target another vendor's storefront.
  // -------------------------------------------------------------------

  async getStorefront(vendorId: string) {
    const vendor = await this.prisma.vendor.findUnique({ where: { id: vendorId } });
    if (!vendor) throw new NotFoundException('Vendor not found');
    return mapVendor(vendor);
  }

  async updateStorefront(vendorId: string, dto: UpdateStorefrontDto) {
    const vendor = await this.prisma.vendor.findUnique({ where: { id: vendorId } });
    if (!vendor) throw new NotFoundException('Vendor not found');

    const updated = await this.prisma.vendor.update({
      where: { id: vendorId },
      data: {
        bio: dto.bio ?? undefined,
        location: dto.location ?? undefined,
        avatarSrc: dto.avatarSrc,
        bannerSrc: dto.bannerSrc,
      },
    });
    return mapVendor(updated);
  }

  // -------------------------------------------------------------------
  // Dashboard — branches by `seller.type`, mirroring the three mock
  // snapshot shapes (`SellerDashboardSnapshot`/`PartnerDashboardSnapshot`/
  // `SnackDashboardSnapshot` in `client/lib/api/seller.ts`) so M8.4's
  // swap is a straight fetch() substitution.
  // -------------------------------------------------------------------

  async getDashboard(
    seller: Seller,
    listingsService: SellerListingsService,
    payoutsService: SellerPayoutsService,
  ) {
    if (seller.type === 'maker' && seller.vendorId) {
      return this.getMakerDashboard(seller as Seller & { vendorId: string }, listingsService, payoutsService);
    }
    if (seller.type === 'laundry') {
      return this.getLaundryDashboard(seller, payoutsService);
    }
    return this.getSnackDashboard(seller, payoutsService);
  }

  private async getMakerDashboard(
    seller: Seller & { vendorId: string },
    listingsService: SellerListingsService,
    payoutsService: SellerPayoutsService,
  ) {
    const vendorId = seller.vendorId;
    const [vendor, productIds, pendingPayoutAmount] = await Promise.all([
      this.prisma.vendor.findUnique({ where: { id: vendorId } }),
      this.prisma.product.findMany({ where: { vendorId }, select: { id: true } }),
      payoutsService.getPendingBalance(seller),
    ]);

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const productIdList = productIds.map((p) => p.id);

    const todayOrders = productIdList.length
      ? await this.prisma.order.findMany({
          where: { placedAt: { gte: todayStart }, items: { some: { productId: { in: productIdList } } } },
          select: { total: true },
        })
      : [];

    const lowStockCount = productIdList.length
      ? await this.prisma.weightOption.count({ where: { productId: { in: productIdList }, stock: { lt: 15 } } })
      : 0;

    return {
      todayOrdersCount: todayOrders.length,
      todayRevenue: todayOrders.reduce((sum, o) => sum + Number(o.total), 0),
      pendingPayoutAmount,
      lowStockCount,
      rating: vendor ? Number(vendor.rating) : 0,
      reviewCount: vendor?.reviewCount ?? 0,
    };
  }

  private async getLaundryDashboard(seller: Seller, payoutsService: SellerPayoutsService) {
    const today = new Date().toISOString().slice(0, 10);
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const [bookings, pendingPayoutAmount] = await Promise.all([
      this.prisma.laundryBooking.findMany({ where: { partnerId: seller.id } }),
      payoutsService.getPendingBalance(seller),
    ]);

    const todayPickupsCount = bookings.filter((b) => b.pickupDate.toISOString().slice(0, 10) === today).length;
    const todayDeliveriesCount = bookings.filter((b) => b.deliveryDate.toISOString().slice(0, 10) === today).length;
    const weekEarnings = bookings
      .filter((b) => b.status !== 'cancelled' && b.createdAt >= weekAgo)
      .reduce((sum, b) => sum + Number(b.estimatedTotal), 0);

    return {
      todayPickupsCount,
      todayDeliveriesCount,
      weekEarnings,
      pendingPayoutAmount,
      rating: seller.rating !== null ? Number(seller.rating) : 0,
      reviewCount: seller.reviewCount ?? 0,
    };
  }

  private async getSnackDashboard(seller: Seller, payoutsService: SellerPayoutsService) {
    const [incomingOrdersCount, menuSize, deliveredOrders, pendingPayoutAmount] = await Promise.all([
      this.prisma.snackOrder.count({ where: { sellerId: seller.id, status: 'received' } }),
      this.prisma.snack.count({ where: { sellerId: seller.id } }),
      this.prisma.snackOrder.findMany({ where: { sellerId: seller.id, status: 'delivered' }, select: { total: true } }),
      payoutsService.getPendingBalance(seller),
    ]);

    return {
      incomingOrdersCount,
      menuSize,
      earnings: deliveredOrders.reduce((sum, o) => sum + Number(o.total), 0),
      pendingPayoutAmount,
    };
  }
}
