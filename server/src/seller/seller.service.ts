import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Seller, SellerSpecialty } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AdminSettingsService } from '../admin/settings.service';
import { checkBusinessName } from '../seller-applications/application-fields';
import {
  isWithdrawnSpecialty,
  vendorTypeForSpecialties,
} from '../seller-applications/specialty-taxonomy';
import { RequestUser } from '../common/types/jwt-payload.type';
import { mapVendor } from '../catalog/mappers/vendor.mapper';
import { UpdateStorefrontDto } from './dto/update-storefront.dto';
import { SetDiscountDto } from './dto/set-discount.dto';
import { MIN_VENDOR_DISCOUNT_PCT } from '../catalog/vendor-discount';
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
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: AdminSettingsService,
  ) {}

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
    const [seller, settings] = await Promise.all([
      this.prisma.seller.findUnique({
        where: { id: user.sellerId },
        include: { vendor: { select: { name: true, slug: true } } },
      }),
      // M37 — the rate the listing form does its "you receive ₹N" math
      // with. Server-supplied on the record every portal screen already
      // loads, so no component ever hardcodes a percentage.
      this.settings.get(),
    ]);
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
      commission: {
        pct: settings.commissionPct,
        enabled: settings.commissionEnabled,
        // GST on the fee (2026-09-02) — so the listing form and payout
        // screen can show the full deduction without a second fetch.
        gstPct: settings.commissionGstPct,
      },
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

  /**
   * The four catalogue-facing fields, plus the storefront's name (M60).
   *
   * **A rename writes two columns and no third.** `Vendor.name` is what a
   * buyer reads and `Seller.displayName` is what the portal and the admin
   * queues read; they are the same fact, so they move together in one
   * transaction or the panel starts disagreeing with the product card.
   * `slug` is **not** re-derived — it is in every storefront URL anybody
   * has shared and everything Google has indexed (the M58 rule for a
   * category rename, for the same reason).
   *
   * **A duplicate name is allowed, deliberately.** Two real kitchens can
   * be called "Home Bakes"; the accounts are told apart by phone and
   * email, which are unique, and refusing the second one would refuse a
   * real person their own shop's name. Shape is still checked through
   * `checkBusinessName` — the same function `/sell` applies — so a rename
   * cannot slip in the email address the application form would have
   * refused.
   *
   * There are no branches: one HomeKrafter is one storefront with one
   * pickup address (`VendorProfile.pickup*`, M36b). A second location
   * would be a second `Vendor`, which splits one kitchen's reviews,
   * followers and payouts in two — the M33 rule, arrived at from the
   * other direction.
   */
  async updateStorefront(vendorId: string, dto: UpdateStorefrontDto) {
    const vendor = await this.prisma.vendor.findUnique({ where: { id: vendorId } });
    if (!vendor) throw new NotFoundException('Vendor not found');

    const name = dto.name?.trim();
    if (name !== undefined) {
      const problem = checkBusinessName(name);
      // The sentence is the server's, and it names the box and the reason
      // — a bare "invalid" leaves somebody guessing at their own shop's
      // name (M22: a refusal carries a reason).
      if (problem) throw new BadRequestException(problem);
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.vendor.update({
        where: { id: vendorId },
        data: {
          name: name ?? undefined,
          bio: dto.bio ?? undefined,
          location: dto.location ?? undefined,
          avatarSrc: dto.avatarSrc,
          bannerSrc: dto.bannerSrc,
        },
      });
      if (name) {
        // `updateMany`: the seller is resolved from the session, and this
        // is keyed on the vendor it manages rather than re-reading a row
        // the caller already owns.
        await tx.seller.updateMany({ where: { vendorId }, data: { displayName: name } });
      }
      return row;
    });
    // Their own record again — see `getStorefront`.
    return mapVendor(updated, undefined, { preciseLocation: true });
  }

  // -------------------------------------------------------------------
  // Their own discount (M46)
  // -------------------------------------------------------------------

  /**
   * Set or clear the caller's own storefront discount.
   *
   * **This is the HomeKrafter's money.** The percentage comes off what a
   * buyer pays, and the commission split is computed on what was actually
   * charged — so the kitchen funds the whole discount. The seller screen
   * says that in those words before anything saves; the rule is repeated
   * here because the next person to read this file will be the one
   * tempted to make the platform absorb it, and that is a different
   * feature with a budget attached.
   *
   * An end date in the past is refused rather than stored. Stored, it
   * would read on every screen as "10% off until last Tuesday" — a
   * discount that is simultaneously set and inert, which is the state
   * that generates support tickets.
   */
  async setDiscount(vendorId: string, dto: SetDiscountDto) {
    const vendor = await this.prisma.vendor.findUnique({ where: { id: vendorId } });
    if (!vendor) throw new NotFoundException('Vendor not found');

    const endsAt = dto.endsAt ? new Date(dto.endsAt) : null;
    if (endsAt && endsAt.getTime() <= Date.now()) {
      throw new BadRequestException('Pick an end date in the future, or leave it empty to run it until you turn it off.');
    }

    const updated = await this.prisma.vendor.update({
      where: { id: vendorId },
      data: {
        // 0 is "off", and it clears the date with it: a stored end date
        // on a zero discount is a fact about nothing that later reads as
        // a discount waiting to start.
        discountPct: dto.pct >= MIN_VENDOR_DISCOUNT_PCT ? dto.pct : null,
        discountEndsAt: dto.pct >= MIN_VENDOR_DISCOUNT_PCT ? endsAt : null,
      },
    });

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
      mealsTodayCount,
      ordersAwaitingCount,
      profileCapacity,
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
      // M37 — the two numbers a cook actually opens the portal for in the
      // morning: meals owed today, and orders sitting un-actioned.
      this.prisma.mealDelivery.count({
        where: {
          status: 'scheduled',
          scheduledFor: { gte: utcDayStart, lt: utcDayEnd },
          subscription: { plan: { vendorId } },
        },
      }),
      this.prisma.order.count({
        where: { status: 'placed', items: { some: { product: { vendorId } } } },
      }),
      this.prisma.vendorProfile.findUnique({
        where: { vendorId },
        select: { capacityPerDay: true },
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
      // M37 — today's work, front and centre.
      mealsTodayCount,
      ordersAwaitingCount,
      capacityPerDay: profileCapacity?.capacityPerDay ?? undefined,
    };
  }
}
