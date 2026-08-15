import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Seller, SellerSpecialty } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  isWithdrawnSpecialty,
  vendorTypeForSpecialties,
} from '../seller-applications/specialty-taxonomy';
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
    if (!user.sellerId) {
      throw new ForbiddenException('No seller account is linked to this session');
    }

    // One query, not `resolveSeller` followed by a vendor read (M31). The
    // two were strictly serial — the vendor id only exists once the seller
    // row lands — and this endpoint is on the critical path of every
    // HomeKrafter sign-in, so that hop was paid on every portal load. The
    // shared `resolveSeller` seam is deliberately left alone: no other
    // controller needs the vendor, and widening it would put a join on
    // every `/seller/*` request instead of taking one off this one.
    const seller = await this.prisma.seller.findUnique({
      where: { id: user.sellerId },
      include: { vendor: { select: { name: true, slug: true } } },
    });
    if (!seller) {
      throw new ForbiddenException('No seller account is linked to this session');
    }
    return {
      id: seller.id,
      userId: seller.userId,
      specialties: seller.specialties,
      vendorId: seller.vendorId,
      vendorName: seller.vendor.name,
      vendorSlug: seller.vendor.slug,
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
    // Exact coordinates: this is the HomeKrafter reading their own
    // record, resolved through `resolveHomeKrafter` from their own
    // session. Rounding here would show somebody their own kitchen in the
    // wrong place. Every buyer-facing route takes the default.
    return mapVendor(vendor, undefined, { preciseLocation: true });
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
    // Their own record again — see `getStorefront`.
    return mapVendor(updated, undefined, { preciseLocation: true });
  }

  // -------------------------------------------------------------------
  // What they make (M33)
  // -------------------------------------------------------------------

  /**
   * Rewrite the caller's own `specialties`, and re-derive `Vendor.type`
   * with them.
   *
   * The owner's ask was that a HomeKrafter registered for food be able to
   * take on gifting and the other categories under the same account. That
   * is already true of *access* — one supply role, every portal module,
   * since M12 — so nothing here grants anything. What was missing was the
   * ability to change the tags at all after approval: they were written
   * once from the application form and no route on any surface could
   * touch them again, which meant a kitchen that started making candles
   * was undiscoverable as one.
   *
   * Three things this deliberately does not do:
   *
   * - **It does not create a second account, application or approval.**
   *   A second application for the same person is a duplicate an admin
   *   then has to reconcile against the first (M31 added duplicate
   *   flagging precisely because those pile up), and approving it would
   *   mint a second `Vendor` — splitting one kitchen's reviews, rating,
   *   followers and payouts across two storefronts.
   * - **It does not re-open moderation.** A tag is not a listing. Every
   *   individual listing still enters the M22 review queue on its own
   *   merits, which is the gate that actually protects a buyer; making a
   *   HomeKrafter wait for an admin before they can *describe* themselves
   *   protects nobody.
   * - **It does not touch verification.** `fssaiVerified` and the rest
   *   stay exactly where they are and remain admin-only (M16). Adding
   *   `homemade_food` makes the FSSAI question start being asked; it does
   *   not answer it.
   *
   * `Vendor.type` is recomputed because approval derives it from these
   * same tags (`AdminSellersService.approveApplication`), and leaving it
   * frozen would mean the column disagrees with its own input the moment
   * anybody edits. It is still rendered on no screen — see
   * `specialty-taxonomy.ts`.
   */
  async updateSpecialties(
    seller: Seller & { vendorId: string },
    specialties: SellerSpecialty[],
  ): Promise<SellerSpecialty[]> {
    // Withdrawn tags may be kept, never newly taken on. `laundry` on an
    // existing row is what makes that partner's old bookings render, so
    // refusing the whole payload for carrying one would lock those
    // HomeKrafters out of this screen entirely.
    const added = specialties.filter((s) => !seller.specialties.includes(s));
    const withdrawn = added.filter(isWithdrawnSpecialty);
    if (withdrawn.length > 0) {
      throw new BadRequestException(
        `Homekrafted no longer offers ${withdrawn.join(' or ')}, so it cannot be added.`,
      );
    }

    // One transaction: the tags and the type they derive from must not be
    // able to end up describing different things.
    const [updated] = await this.prisma.$transaction([
      this.prisma.seller.update({
        where: { id: seller.id },
        data: { specialties },
      }),
      this.prisma.vendor.update({
        where: { id: seller.vendorId },
        data: { type: vendorTypeForSpecialties(specialties) },
      }),
    ]);

    return updated.specialties;
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
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const vendorId = seller.vendorId;

    // The pickup/delivery counters compare **UTC** calendar days: they
    // were `date.toISOString().slice(0, 10) === today`, filtered in JS.
    // Moving the filter into SQL keeps that exactly — it is not the same
    // day as `todayStart`, which is local midnight, and quietly
    // "correcting" it here would move somebody's counter by a day.
    const utcDayStart = new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00.000Z`);
    const utcDayEnd = new Date(utcDayStart.getTime() + 24 * 60 * 60 * 1000);

    // One wave (M31). This was two, because everything on the second one
    // needed the list of product ids from the first — so a dashboard that
    // is already the login destination paid two serial round trips of
    // latency to ask questions expressible as a join on `vendorId`. The
    // reads that pulled whole rows to sum or count them in JS
    // (`laundryBooking.findMany` over *every* booking ever, both snack
    // and product lists) are aggregates now; only what is displayed comes
    // back.
    const [
      vendor,
      listingsCount,
      activeListingsCount,
      lowStockCount,
      todayOrders,
      pendingPayoutAmount,
      todayPickupsCount,
      todayDeliveriesCount,
      weekEarningsAgg,
      incomingOrdersCount,
      menuSize,
      snackEarningsAgg,
    ] = await Promise.all([
      this.prisma.vendor.findUnique({
        where: { id: vendorId },
        select: { rating: true, reviewCount: true },
      }),
      this.prisma.product.count({ where: { vendorId } }),
      this.prisma.product.count({ where: { vendorId, isAvailable: true } }),
      this.prisma.weightOption.count({ where: { product: { vendorId }, stock: { lt: 15 } } }),
      this.prisma.order.aggregate({
        where: { placedAt: { gte: todayStart }, items: { some: { product: { vendorId } } } },
        _count: { _all: true },
        _sum: { total: true },
      }),
      payoutsService.getPendingBalance(seller),
      this.prisma.laundryBooking.count({
        where: { partnerId: seller.id, pickupDate: { gte: utcDayStart, lt: utcDayEnd } },
      }),
      this.prisma.laundryBooking.count({
        where: { partnerId: seller.id, deliveryDate: { gte: utcDayStart, lt: utcDayEnd } },
      }),
      this.prisma.laundryBooking.aggregate({
        where: {
          partnerId: seller.id,
          status: { not: 'cancelled' },
          createdAt: { gte: weekAgo },
        },
        _sum: { estimatedTotal: true },
      }),
      this.prisma.snackOrder.count({ where: { sellerId: seller.id, status: 'received' } }),
      this.prisma.snack.count({ where: { sellerId: seller.id } }),
      this.prisma.snackOrder.aggregate({
        where: { sellerId: seller.id, status: 'delivered' },
        _sum: { total: true },
      }),
    ]);

    return {
      // Storefront / marketplace
      todayOrdersCount: todayOrders._count._all,
      todayRevenue: Number(todayOrders._sum.total ?? 0),
      listingsCount,
      activeListingsCount,
      lowStockCount,
      // Laundry / pickups — zero for a HomeKrafter who doesn't do pickups.
      todayPickupsCount,
      todayDeliveriesCount,
      weekEarnings: Number(weekEarningsAgg._sum.estimatedTotal ?? 0),
      // Snacks / WhatsApp orders
      incomingOrdersCount,
      menuSize,
      snackEarnings: Number(snackEarningsAgg._sum.total ?? 0),
      // Money + reputation
      pendingPayoutAmount,
      rating: vendor ? Number(vendor.rating) : 0,
      reviewCount: vendor?.reviewCount ?? 0,
    };
  }
}
