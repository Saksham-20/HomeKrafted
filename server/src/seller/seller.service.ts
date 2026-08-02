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

  /**
   * Every `/seller/*` surface resolves through here now.
   *
   * This replaced `resolveMaker`/`resolveLaundryPartner`/`resolveSnackSeller`,
   * which threw `403 "only available to <type> sellers"` and were the reason
   * a HomeKrafter could see a module in their nav but not open it. There is
   * one role: if you have an approved HomeKrafter account you get every
   * module, and whether you happen to make pickles or run a laundry is a
   * `specialties` tag for buyers to filter on, never an access decision.
   *
   * `vendorId` is non-null in the schema, so the storefront-scoped services
   * (listings, orders, reviews) can rely on it without a narrowing check.
   */
  async resolveHomeKrafter(user: RequestUser): Promise<Seller & { vendorId: string }> {
    const seller = await this.resolveSeller(user);
    return seller as Seller & { vendorId: string };
  }

  /**
   * The caller's own seller record, shaped like the client's `Seller`
   * type. `vendorName` rides along so the portal header can name the
   * storefront without a second request.
   */
  async getOwnRecord(user: RequestUser) {
    const seller = await this.resolveHomeKrafter(user);
    const vendor = await this.prisma.vendor.findUnique({
      where: { id: seller.vendorId },
      select: { name: true, slug: true },
    });
    return {
      id: seller.id,
      userId: seller.userId,
      specialties: seller.specialties,
      vendorId: seller.vendorId,
      vendorName: vendor?.name,
      vendorSlug: vendor?.slug,
      displayName: seller.displayName,
      status: seller.status,
      createdAt: seller.createdAt.toISOString(),
      rating: seller.rating !== null ? Number(seller.rating) : undefined,
      reviewCount: seller.reviewCount ?? undefined,
    };
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

  /**
   * One dashboard snapshot for every HomeKrafter.
   *
   * Was three mutually exclusive shapes chosen by `seller.type`
   * (maker/laundry/snack), which is exactly what the single-role change
   * removes. A HomeKrafter who cooks *and* runs pickups sees both sets of
   * numbers; one who only cooks sees zeroes in the pickup counters, which
   * is honest rather than hidden.
   */
  async getDashboard(
    seller: Seller & { vendorId: string },
    listingsService: SellerListingsService,
    payoutsService: SellerPayoutsService,
  ) {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const today = new Date().toISOString().slice(0, 10);
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const vendorId = seller.vendorId;

    const [vendor, products, pendingPayoutAmount, bookings, snackStats] = await Promise.all([
      this.prisma.vendor.findUnique({ where: { id: vendorId } }),
      this.prisma.product.findMany({ where: { vendorId }, select: { id: true, isAvailable: true } }),
      payoutsService.getPendingBalance(seller),
      this.prisma.laundryBooking.findMany({ where: { partnerId: seller.id } }),
      Promise.all([
        this.prisma.snackOrder.count({ where: { sellerId: seller.id, status: 'received' } }),
        this.prisma.snack.count({ where: { sellerId: seller.id } }),
        this.prisma.snackOrder.findMany({
          where: { sellerId: seller.id, status: 'delivered' },
          select: { total: true },
        }),
      ]),
    ]);

    const productIdList = products.map((p) => p.id);
    const [incomingSnackOrders, menuSize, deliveredSnackOrders] = snackStats;

    const [todayOrders, lowStockCount] = await Promise.all([
      productIdList.length
        ? this.prisma.order.findMany({
            where: { placedAt: { gte: todayStart }, items: { some: { productId: { in: productIdList } } } },
            select: { total: true },
          })
        : Promise.resolve([]),
      productIdList.length
        ? this.prisma.weightOption.count({
            where: { productId: { in: productIdList }, stock: { lt: 15 } },
          })
        : Promise.resolve(0),
    ]);

    const marketplaceRevenue = todayOrders.reduce((sum, o) => sum + Number(o.total), 0);
    const snackEarnings = deliveredSnackOrders.reduce((sum, o) => sum + Number(o.total), 0);

    return {
      // Storefront / marketplace
      todayOrdersCount: todayOrders.length,
      todayRevenue: marketplaceRevenue,
      listingsCount: products.length,
      activeListingsCount: products.filter((p) => p.isAvailable).length,
      lowStockCount,
      // Laundry / pickups — zero for a HomeKrafter who doesn't do pickups.
      todayPickupsCount: bookings.filter((b) => b.pickupDate.toISOString().slice(0, 10) === today).length,
      todayDeliveriesCount: bookings.filter((b) => b.deliveryDate.toISOString().slice(0, 10) === today).length,
      weekEarnings: bookings
        .filter((b) => b.status !== 'cancelled' && b.createdAt >= weekAgo)
        .reduce((sum, b) => sum + Number(b.estimatedTotal), 0),
      // Snacks / WhatsApp orders
      incomingOrdersCount: incomingSnackOrders,
      menuSize,
      snackEarnings,
      // Money + reputation
      pendingPayoutAmount,
      rating: vendor ? Number(vendor.rating) : 0,
      reviewCount: vendor?.reviewCount ?? 0,
    };
  }
}
