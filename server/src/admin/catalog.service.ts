import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, ProductModerationStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PRODUCT_INCLUDE, mapProduct, mapProductForMaker } from '../catalog/mappers/product.mapper';
import { DEFAULT_BROWSE_ORDER } from '../catalog/browse-order';
import { AdminSettingsService } from './settings.service';
import { mapReview } from '../reviews/reviews.mapper';
import { mapSnackForOwner } from '../snacks/snacks.mapper';
import { ReviewAggregatesService } from '../reviews/review-aggregates.service';
import { AdminAuditLogService } from './audit-log.service';
import { ModerationNotificationsService } from './moderation-notifications.service';
import { ModerateProductDto } from './dto/moderate-product.dto';
import { ListAdminCatalogQueryDto } from './dto/list-admin-catalog.query.dto';
import { moderationDecision, REFUSING_ACTIONS, type ModeratableKind } from '../catalog/moderation';
import { MealPlanDayMenusService } from '../meals/day-menus.service';
import { SellerListingsService } from '../seller/listings.service';
import { CreateAdminProductDto } from './dto/create-admin-product.dto';
import { UpdateListingDto } from '../seller/dto/update-listing.dto';

const DEFAULT_CATALOG_PAGE_SIZE = 25;

/**
 * The platform's own storefront. Seeded (`server/prisma/seed.ts`) and
 * referenced by slug rather than id so it survives a reseed.
 */
const PLATFORM_VENDOR_SLUG = 'homekrafted';

/**
 * How many pending items the unified queue returns at once. Not a page
 * size — see `listReviewQueue`. If this is ever hit, the depth is the
 * story and `total` still reports it honestly.
 */
const REVIEW_QUEUE_CAP = 200;

export interface ReviewQueueItem {
  kind: ModeratableKind;
  id: string;
  name: string;
  /** Vendor name for a product or plan, HomeKrafter display name for a snack. */
  makerName: string;
  submittedAt: string;
  imageSrc?: string;
  /** Only products have an admin detail screen today. */
  editHref?: string;
}

export interface ReviewQueue {
  items: ReviewQueueItem[];
  total: number;
  counts: Record<ModeratableKind, number>;
}

/**
 * Oldest submission first, so a resubmission takes its turn at the back
 * rather than holding its original place forever. `nulls: 'last'` covers
 * pre-M22 rows that never had a `submittedAt`.
 */
const PENDING_ORDER = [
  { submittedAt: { sort: 'asc' as const, nulls: 'last' as const } },
  { createdAt: 'asc' as const },
  // Unique final key — without it a page boundary between two listings
  // submitted in the same second can show one twice and skip another.
  { id: 'asc' as const },
];

/** For an already-decided listing, recency is what an admin is looking for. */
const DECIDED_ORDER = [{ createdAt: 'desc' as const }, { id: 'desc' as const }];

type ProductWithNames = Prisma.ProductGetPayload<{ include: typeof PRODUCT_INCLUDE }>;

export interface PaginatedCatalog {
  /**
   * Buyer-facing prices (2026-09-16) — `mapProduct`, not
   * `mapProductForMaker`. `ProductModerationRow`'s "Preview card" renders
   * `<ProductCard>` straight off this row under the label "As a buyer
   * sees it" (CLAUDE.md: "the admin catalogue row previews the
   * buyer-facing card") — handing it a maker's base price would silently
   * show an admin a number no shopper is ever charged, whenever the fee
   * is on. The single-product read/write endpoints (`getById`, `create`,
   * `update`) are the ones that legitimately want `mapProductForMaker` —
   * they feed the *edit form*, where the editable box is the figure a
   * maker types and is paid.
   */
  items: (ReturnType<typeof mapProduct> & {
    vendorName: string;
    categoryName: string;
    orderCount?: number;
  })[];
  page: number;
  pageSize: number;
  total: number;
  /**
   * Listings awaiting review, platform-wide — never narrowed by the
   * caller's filter or page. It is the queue badge, and one that reads
   * zero because the admin is looking at "hidden" is worse than none.
   */
  pendingCount: number;
}

/**
 * Unscoped catalog + review moderation — every `Product` across every
 * vendor, every `Review` across every target. `hide`/`takedown` move a
 * listing out of `PUBLICLY_LISTED` (`catalog/moderation.ts` — public
 * browse filters on the `active` allowlist since M22, never a denylist),
 * so a hidden product disappears from browse immediately. `getBySlug`
 * still resolves a hidden product (direct link/cart/order/wishlist
 * lookups must keep working — see `isDirectlyResolvable`), so "hidden"
 * here means "delisted from browse", not "the row stopped existing".
 */
@Injectable()
export class AdminCatalogService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AdminAuditLogService,
    private readonly reviewAggregates: ReviewAggregatesService,
    private readonly moderationNotifications: ModerationNotificationsService,
    private readonly dayMenus: MealPlanDayMenusService,
    // M44 — one owner of product writes. Named for the portal it was
    // built for; the rules that differ for an admin are carried by
    // `ListingWriteOptions`, not by a second copy of the write.
    private readonly listings: SellerListingsService,
    // The commission rate (2026-09-16). The *edit* screen (`getById`,
    // `create`, `update`) shows an admin listing on a maker's behalf
    // (M44) base prices and carries `buyerPrice` beside them, never the
    // marked-up figure in the editable box — they type the maker's
    // take-home, exactly as the maker would. The *list* (`listProducts`,
    // via `withNames`) shows buyer-facing prices instead, because its
    // "As a buyer sees it" card preview has to match what a shopper is
    // actually charged (`PaginatedCatalog`'s doc comment).
    private readonly settings: AdminSettingsService,
  ) {}

  /**
   * The audited path past the menu lock (M37) — same underlying write as
   * the seller route (`MealPlanDayMenusService.setDayMenu`), with
   * `enforceLock: false` and a before/after audit row. Subscribers
   * scheduled for the date are still notified; the lock exists to stop
   * *silent* changes, not to stop people being told.
   */
  async overrideMealPlanDayMenu(adminUserId: string, planId: string, date: Date, lines: string[]) {
    const plan = await this.dayMenus.findPlan(planId);
    const before = await this.prisma.mealPlanDayMenu.findUnique({
      where: { planId_date: { planId, date } },
      select: { lines: true },
    });

    const view = await this.dayMenus.setDayMenu(plan, date, lines, {
      enforceLock: false,
      now: new Date(),
    });

    await this.auditLog.log({
      actorId: adminUserId,
      action: 'meal_plan.menu_override',
      targetType: 'MealPlan',
      targetId: planId,
      metadata: {
        date: view.date,
        before: before?.lines ?? null,
        after: view.source === 'day' ? view.lines : null,
      },
    });

    return view;
  }

  /**
   * The review queue.
   *
   * **Pending first, oldest submission first** — a queue, not a catalogue
   * dump. Since M22 a listing is invisible until someone here acts on it,
   * so the ordering is the difference between a HomeKrafter waiting a day
   * and waiting until an admin happens to scroll far enough. `submittedAt`
   * rather than `createdAt` is what makes a resubmission take its turn at
   * the back instead of holding its original place forever.
   *
   * Everything else follows in the old newest-first order, because for an
   * already-decided listing recency is what an admin is looking for.
   */
  async listProducts(query: ListAdminCatalogQueryDto = {}): Promise<PaginatedCatalog> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? DEFAULT_CATALOG_PAGE_SIZE;
    const skip = (page - 1) * pageSize;

    const scope: Prisma.ProductWhereInput = {};
    if (query.vendorId) scope.vendorId = query.vendorId;
    if (query.kind) scope.kind = query.kind;
    if (query.q) {
      const contains = { contains: query.q, mode: 'insensitive' as const };
      scope.OR = [
        { name: contains },
        { vendor: { name: contains } },
        { category: { name: contains } },
      ];
    }

    // `featured` is a different column, not a moderation state — keeping
    // the translation here is what stops it leaking into the enum.
    const statusWhere: Prisma.ProductWhereInput =
      query.status === 'featured'
        ? { featured: true }
        : query.status
          ? { moderationStatus: query.status }
          : {};

    const pendingScoped: Prisma.ProductWhereInput = { ...scope, ...statusWhere };

    // The waiting count is deliberately **not** scoped to the current
    // filter or page: it is the queue badge, and a badge that reads zero
    // because the admin happens to be looking at "hidden" is worse than no
    // badge. Somebody's income is behind that number.
    const pendingCountPromise = this.prisma.product.count({
      where: { moderationStatus: 'pending' },
    });

    let rows: ProductWithNames[];
    let total: number;

    if (query.status) {
      // One state, one natural order — nothing to interleave.
      const [found, count, pendingCount] = await Promise.all([
        this.prisma.product.findMany({
          where: pendingScoped,
          include: PRODUCT_INCLUDE,
          orderBy: query.status === 'pending' ? PENDING_ORDER : DECIDED_ORDER,
          skip,
          take: pageSize,
        }),
        this.prisma.product.count({ where: pendingScoped }),
        pendingCountPromise,
      ]);
      rows = found;
      total = count;
      return this.withNames(rows, page, pageSize, total, pendingCount);
    }

    /**
     * Unfiltered: pending listings lead, oldest submission first, then
     * everything already decided newest first. Postgres cannot express
     * that in one `ORDER BY` without a `CASE` Prisma will not emit, so it
     * stays two queries — but a page is now cut out of the *concatenation*
     * arithmetically rather than by materialising both halves and slicing.
     * A page wholly inside one half reads only that half.
     */
    const [pendingTotal, decidedTotal, pendingCount] = await Promise.all([
      this.prisma.product.count({ where: { ...scope, moderationStatus: 'pending' } }),
      this.prisma.product.count({ where: { ...scope, moderationStatus: { not: 'pending' } } }),
      pendingCountPromise,
    ]);

    const fromPending = Math.max(0, Math.min(pageSize, pendingTotal - skip));
    const [pending, decided] = await Promise.all([
      fromPending > 0
        ? this.prisma.product.findMany({
            where: { ...scope, moderationStatus: 'pending' },
            include: PRODUCT_INCLUDE,
            orderBy: PENDING_ORDER,
            skip,
            take: fromPending,
          })
        : Promise.resolve([]),
      fromPending < pageSize
        ? this.prisma.product.findMany({
            where: { ...scope, moderationStatus: { not: 'pending' } },
            include: PRODUCT_INCLUDE,
            orderBy: DECIDED_ORDER,
            // Once the pending half is exhausted the offset carries over
            // into the decided half — `skip - pendingTotal` on later
            // pages, and 0 on the page that straddles the boundary.
            skip: Math.max(0, skip - pendingTotal),
            take: pageSize - fromPending,
          })
        : Promise.resolve([]),
    ]);

    return this.withNames(
      [...pending, ...decided],
      page,
      pageSize,
      pendingTotal + decidedTotal,
      pendingCount,
    );
  }

  /** Batches the vendor/category name lookups for one page of listings. */
  private async withNames(
    products: ProductWithNames[],
    page: number,
    pageSize: number,
    total: number,
    pendingCount: number,
  ): Promise<PaginatedCatalog> {
    const vendorIds = [...new Set(products.map((p) => p.vendorId))];
    const categoryIds = [...new Set(products.map((p) => p.categoryId))];
    const productIds = products.map((p) => p.id);

    const [vendors, categories, orderItemGroups] = await Promise.all([
      vendorIds.length
        ? this.prisma.vendor.findMany({ where: { id: { in: vendorIds } }, select: { id: true, name: true } })
        : Promise.resolve([]),
      categoryIds.length
        ? this.prisma.category.findMany({ where: { id: { in: categoryIds } }, select: { id: true, name: true } })
        : Promise.resolve([]),
      productIds.length
        ? this.prisma.orderItem.groupBy({
            by: ['productId'],
            where: { productId: { in: productIds } },
            _sum: { quantity: true },
            _count: { id: true },
          })
        : Promise.resolve([]),
    ]);
    const vendorNameById = new Map(vendors.map((v) => [v.id, v.name]));
    const categoryNameById = new Map(categories.map((c) => [c.id, c.name]));
    const orderCountById = new Map(
      orderItemGroups
        .filter((g) => g.productId != null)
        .map((g) => [g.productId!, g._sum.quantity ?? g._count.id]),
    );

    const rate = await this.settings.getCommissionRate();
    return {
      items: products.map((p) => ({
        ...mapProduct(p, rate),
        vendorName: vendorNameById.get(p.vendorId) ?? 'Unknown vendor',
        categoryName: categoryNameById.get(p.categoryId) ?? 'Uncategorised',
        orderCount: orderCountById.get(p.id) ?? 0,
      })),
      page,
      pageSize,
      total,
      pendingCount,
    };
  }

  /**
   * The vendor an admin-authored listing belongs to when none is chosen
   * (M44).
   *
   * The platform sells under its own storefront — "Homekrafted" — and
   * that is a real `Vendor` row rather than a null `vendorId`, because
   * every product card, order line, review aggregate and payout query in
   * the codebase assumes a product has a maker. A nullable one would mean
   * teaching all of them about a second case, and the first one missed
   * renders "undefined" under somebody's photograph.
   */
  private async platformVendorId(): Promise<string> {
    const vendor = await this.prisma.vendor.findUnique({
      where: { slug: PLATFORM_VENDOR_SLUG },
      select: { id: true },
    });
    if (!vendor) {
      throw new NotFoundException(
        `No vendor with the slug "${PLATFORM_VENDOR_SLUG}" exists, so there is nothing to list this under. Seed it, or pick a HomeKrafter to attribute the listing to.`,
      );
    }
    return vendor.id;
  }

  /**
   * Create a listing as an admin (M44).
   *
   * **Two jobs, one route.** The obvious one is the platform listing its
   * own products, which is why `vendorId` defaults to Homekrafted. The
   * one that matters more is *assisted onboarding*: the research into how
   * Swiggy actually onboards restaurants found they do not make partners
   * type menus — the restaurant sends photographs and somebody at Swiggy
   * transcribes them. A home cook who cannot face a listing form is the
   * normal case here, not the edge case, so an operator has to be able to
   * list **on a HomeKrafter's behalf**, against that kitchen's own
   * `vendorId`, or the product only serves the people who least need it.
   *
   * The listing goes live immediately rather than into the review queue,
   * with the admin recorded in the moderation columns — see
   * `initialAdminSubmission`.
   */
  async createProduct(adminUserId: string, dto: CreateAdminProductDto) {
    const vendorId = dto.vendorId ?? (await this.platformVendorId());
    const vendor = await this.prisma.vendor.findUnique({
      where: { id: vendorId },
      select: { id: true, name: true },
    });
    if (!vendor) throw new NotFoundException('Vendor not found');

    const product = await this.listings.create(vendorId, dto, {
      actor: 'admin',
      moderatorUserId: adminUserId,
    });

    await this.auditLog.log({
      actorId: adminUserId,
      action: 'product.create',
      targetType: 'Product',
      targetId: product.id,
      metadata: { name: product.name, vendorId, vendorName: vendor.name },
    });

    return product;
  }

  /**
   * Edit any vendor's listing (M44).
   *
   * The screen for this shipped in M11b and **wrote nothing**: its client
   * wrapper mutated an in-memory mock array and the page navigated away
   * as though it had saved. An admin correcting a listing therefore
   * watched their edit disappear on the next load, with no error to
   * explain it.
   *
   * `SellerListingsService.update` scopes by `vendorId`, so the product's
   * own vendor is resolved first and passed in — the scope check then
   * passes trivially, and one method still owns every product write.
   * `actor: 'admin'` is what stops the edit re-queueing: an operator
   * fixing a typo must not take a live listing off sale to do it.
   */
  async updateProduct(adminUserId: string, productId: string, dto: UpdateListingDto) {
    const existing = await this.prisma.product.findUnique({
      where: { id: productId },
      select: { id: true, vendorId: true },
    });
    if (!existing) throw new NotFoundException('Product not found');

    const product = await this.listings.update(existing.vendorId, productId, dto, {
      actor: 'admin',
      moderatorUserId: adminUserId,
    });

    await this.auditLog.log({
      actorId: adminUserId,
      action: 'product.update',
      targetType: 'Product',
      targetId: productId,
      metadata: { name: product.name, vendorId: existing.vendorId },
    });

    return product;
  }

  /**
   * The featured set, in the order buyers see it (2026-09-19).
   *
   * Every listing with `featured = true` is returned whatever its review
   * state: a featured listing an admin later hid still occupies a place in
   * the set, and the screen has to be able to show it in order to let the
   * admin take it out. `moderationStatus` and `isAvailable` ride on each
   * row for exactly that.
   */
  async listFeatured() {
    const [rows, rate] = await Promise.all([
      this.prisma.product.findMany({
        where: { featured: true },
        include: PRODUCT_INCLUDE,
        // **The buyer's own order, from the same constant** —
        // `DEFAULT_BROWSE_ORDER` (`catalog/browse-order.ts`): rank ascending
        // NULLS LAST, then rating, review count, id. Its leading
        // `featured DESC` is constant here (every row is featured). This
        // used to order the unranked by name, so two featured listings
        // nobody had ranked read "1, 2" on this screen in an order buyers
        // did not get — the position badges claimed a placement that was
        // not in effect. Sharing the constant is what keeps the two from
        // being edited apart.
        orderBy: DEFAULT_BROWSE_ORDER,
      }),
      this.settings.getCommissionRate(),
    ]);

    const vendorIds = [...new Set(rows.map((p) => p.vendorId))];
    const categoryIds = [...new Set(rows.map((p) => p.categoryId))];
    const [vendors, categories] = await Promise.all([
      vendorIds.length
        ? this.prisma.vendor.findMany({ where: { id: { in: vendorIds } }, select: { id: true, name: true } })
        : Promise.resolve([]),
      categoryIds.length
        ? this.prisma.category.findMany({ where: { id: { in: categoryIds } }, select: { id: true, name: true } })
        : Promise.resolve([]),
    ]);
    const vendorNameById = new Map(vendors.map((v) => [v.id, v.name]));
    const categoryNameById = new Map(categories.map((c) => [c.id, c.name]));

    return {
      items: rows.map((p) => ({
        ...mapProduct(p, rate),
        vendorName: vendorNameById.get(p.vendorId) ?? 'Unknown vendor',
        categoryName: categoryNameById.get(p.categoryId) ?? 'Uncategorised',
      })),
      total: rows.length,
    };
  }

  /**
   * Replace the featured set with `productIds`, in order.
   *
   * **A full replacement, in one transaction.** Array position is the
   * rank — index 0 becomes `featuredRank` 1 — and any listing that was
   * featured and is not in the list is unfeatured and loses its rank. A
   * set that can only grow is one nobody can curate, and two writes
   * (unfeature, then rank) that could half-apply would leave a listing
   * featured with a rank from a list that no longer exists.
   *
   * **Merchandising, not moderation**: only `featured` and `featuredRank`
   * are written, never `moderationStatus`, `moderationNote` or
   * `moderatedAt` — putting a flagged listing in the featured set must
   * not erase the reason it was flagged (M22, the rule `feature` already
   * keeps). Featuring does not require the listing to be live; a buyer
   * only ever sees it once it also passes `PUBLICLY_LISTED`.
   *
   * Duplicates collapse to their first position. An id that does not
   * exist is a 400 naming it, before anything is written — the same
   * refusal shape as a duplicate occasion (M43): the admin is told which
   * row was wrong rather than having it silently dropped.
   *
   * **A stale list cannot silently unfeature somebody else's listing.**
   * `basedOn` is the featured ids the admin's screen loaded. Because this
   * is a full replacement, a save from a list opened before another admin
   * featured something (the Products tab's Feature button adds a listing
   * unranked, at any time) would drop that listing without either admin
   * being told. When `basedOn` is sent, a listing that is featured now,
   * was not in it, and is missing from `productIds` is a 409 naming it
   * before anything is written. Only that direction is guarded: reordering
   * over another admin's order is a last-write-wins the screen showed, and
   * a listing the admin kept in the list is theirs to keep. Omitting
   * `basedOn` keeps the old unconditional replacement, so a client that
   * predates the field is not refused.
   */
  async setFeatured(adminUserId: string, productIds: string[], basedOn?: string[]) {
    const ids = [...new Set(productIds)];

    const before = await this.prisma.$transaction(
      async (tx) => {
        // Checked inside the transaction, so a listing deleted between the
        // check and the write cannot turn a refusal into a 500 halfway
        // through. Nothing has been written when this throws.
        if (ids.length > 0) {
          const found = await tx.product.findMany({
            where: { id: { in: ids } },
            select: { id: true },
          });
          const known = new Set(found.map((p) => p.id));
          const missing = ids.filter((id) => !known.has(id));
          if (missing.length > 0) {
            const named = missing.slice(0, 10).join(', ');
            const more = missing.length > 10 ? ` and ${missing.length - 10} more` : '';
            throw new BadRequestException(
              `No listing exists with the id ${named}${more}. It may have been deleted — reload the featured list and try again.`,
            );
          }
        }

        const previous = await tx.product.findMany({
          where: { featured: true },
          orderBy: DEFAULT_BROWSE_ORDER,
          select: { id: true, name: true },
        });

        if (basedOn) {
          const seen = new Set(basedOn);
          const keeping = new Set(ids);
          const unseen = previous.filter((p) => !seen.has(p.id) && !keeping.has(p.id));
          if (unseen.length > 0) {
            const named = unseen
              .slice(0, 3)
              .map((p) => `“${p.name}”`)
              .join(', ');
            const more = unseen.length > 3 ? ` and ${unseen.length - 3} more` : '';
            throw new ConflictException(
              `${named}${more} ${unseen.length === 1 ? 'was' : 'were'} featured after you opened this list, and saving now would unfeature ${unseen.length === 1 ? 'it' : 'them'}. Reload the list to see what changed, then save again.`,
            );
          }
        }

        // Everything featured and not listed goes back to unfeatured, rank
        // cleared. `notIn: []` matches every row, which is exactly
        // "feature nothing".
        await tx.product.updateMany({
          where: { featured: true, id: { notIn: ids } },
          data: { featured: false, featuredRank: null },
        });
        for (const [index, id] of ids.entries()) {
          await tx.product.update({
            where: { id },
            data: { featured: true, featuredRank: index + 1 },
            select: { id: true },
          });
        }
        return previous.map((p) => p.id);
      },
      // Up to `MAX_FEATURED` sequential updates on one connection; the 5 s
      // default is generous for that on a warm box and not on a cold one.
      { timeout: 15_000 },
    );

    await this.auditLog.log({
      actorId: adminUserId,
      action: 'catalog.featured_set',
      targetType: 'Product',
      metadata: { before, after: ids },
    });

    return this.listFeatured();
  }

  async getProduct(id: string) {
    const product = await this.prisma.product.findUnique({ where: { id }, include: PRODUCT_INCLUDE });
    if (!product) throw new NotFoundException('Product not found');
    const [vendor, category] = await Promise.all([
      this.prisma.vendor.findUnique({ where: { id: product.vendorId }, select: { name: true } }),
      this.prisma.category.findUnique({ where: { id: product.categoryId }, select: { name: true } }),
    ]);
    return {
      ...mapProductForMaker(product, await this.settings.getCommissionRate()),
      vendorName: vendor?.name ?? 'Unknown vendor',
      categoryName: category?.name ?? 'Uncategorised',
    };
  }

  /**
   * Every action an admin can take on a listing, and — since M22 — the
   * reason and the notification that go with it.
   *
   * What changed: `approve` and `reject` are new (nothing could resolve a
   * `pending` listing before, because `pending` did not exist), a refusing
   * action now **requires** a reason, the reason is stored on the row so
   * the HomeKrafter can read it in their portal, and every decision is
   * recorded with who made it and when. Previously a listing could be
   * hidden and its owner was never told, nor why — the audit log recorded
   * the action but nothing reached the person affected.
   */
  async moderateProduct(adminUserId: string, id: string, dto: ModerateProductDto) {
    const existing = await this.prisma.product.findUnique({
      where: { id },
      include: { vendor: { select: { name: true, seller: { select: { userId: true } } } } },
    });
    if (!existing) throw new NotFoundException('Product not found');

    this.assertReasonGiven(dto);

    // Shared with `moderateSnack`/`moderateMealPlan` since M28. The action
    // -> status mapping used to live here as a run of `if`s; three copies
    // of it is how one table would come to treat `takedown` differently
    // from another, visible only as a listing that quietly stayed up.
    // `feature`/`unfeature` still return no status, so the note and the
    // decision stamp are left alone — see `moderationDecision`.
    const data: Prisma.ProductUncheckedUpdateInput = moderationDecision(
      dto.action,
      adminUserId,
      dto.reason,
    );

    const updated = await this.prisma.product.update({ where: { id }, data, include: PRODUCT_INCLUDE });

    await this.auditLog.log({
      actorId: adminUserId,
      action: `product.${dto.action}`,
      targetType: 'Product',
      targetId: id,
      metadata: {
        from: existing.moderationStatus,
        to: updated.moderationStatus,
        reason: dto.reason?.trim() ?? null,
      },
    });

    // `void` — a moderation decision must not roll back because a message
    // failed to send, the same rule order notifications follow.
    if (data.moderationStatus !== undefined && existing.vendor.seller?.userId) {
      void this.moderationNotifications.productDecided({
        userId: existing.vendor.seller.userId,
        productName: existing.name,
        productId: id,
        status: updated.moderationStatus,
        reason: dto.reason?.trim(),
      });
    }

    const category = await this.prisma.category.findUnique({
      where: { id: updated.categoryId },
      select: { name: true },
    });
    return {
      ...mapProductForMaker(updated, await this.settings.getCommissionRate()),
      vendorName: existing.vendor.name,
      categoryName: category?.name ?? 'Uncategorised',
    };
  }

  /**
   * Everything awaiting review, across all three catalogue tables.
   *
   * **The queue this replaces did not exist.** M22 put the gate on
   * `Product`, `Snack` and `MealPlan`; the admin side was built for
   * `Product` alone. `listProducts` reads `prisma.product`, and there was
   * no endpoint that could approve a snack — so a snack created after M22
   * sat `pending` forever, filtered out of every buyer-facing query, while
   * its maker was correctly told it was waiting for approval. Found on the
   * live site on 2026-08-10 by a HomeKrafter whose first menu item never
   * appeared.
   *
   * **Deliberately unpaginated, and capped instead.** This is the
   * actionable backlog rather than a browsable archive: an admin works it
   * to empty. Paginating a union of three differently-sorted tables buys
   * correctness problems (a stable offset across heterogeneous sets) to
   * solve a problem the platform does not have yet, and if the queue ever
   * exceeds the cap then the cap being hit *is* the finding. `total` is
   * counted separately so a truncated page still reports the real depth.
   *
   * Oldest submission first across the three, so a snack does not wait
   * behind every product merely for being a snack.
   */
  async listReviewQueue(): Promise<ReviewQueue> {
    const pending = { moderationStatus: 'pending' as const };

    const [products, snacks, mealPlans, productCount, snackCount, mealPlanCount] = await Promise.all([
      this.prisma.product.findMany({
        where: pending,
        orderBy: PENDING_ORDER,
        take: REVIEW_QUEUE_CAP,
        include: { vendor: { select: { name: true } } },
      }),
      this.prisma.snack.findMany({
        where: pending,
        // Not `PENDING_ORDER`: `Snack` has no `createdAt` column, so the
        // shared order's `createdAt` tiebreak is not a valid field here and
        // Prisma 500s on it. `submittedAt` plus the id is the same
        // guarantee — oldest first, with a unique final key so a page
        // boundary cannot show one row twice.
        orderBy: [
          { submittedAt: { sort: 'asc' as const, nulls: 'last' as const } },
          { id: 'asc' as const },
        ],
        take: REVIEW_QUEUE_CAP,
        include: { seller: { select: { displayName: true } } },
      }),
      this.prisma.mealPlan.findMany({
        where: pending,
        orderBy: PENDING_ORDER,
        take: REVIEW_QUEUE_CAP,
        include: { vendor: { select: { name: true } } },
      }),
      this.prisma.product.count({ where: pending }),
      this.prisma.snack.count({ where: pending }),
      this.prisma.mealPlan.count({ where: pending }),
    ]);

    const items: ReviewQueueItem[] = [
      ...products.map((p) => ({
        kind: 'product' as const,
        id: p.id,
        name: p.name,
        makerName: p.vendor.name,
        submittedAt: (p.submittedAt ?? p.createdAt).toISOString(),
        imageSrc: undefined as string | undefined,
        editHref: `/admin/catalog/${p.id}`,
      })),
      ...snacks.map((s) => ({
        kind: 'snack' as const,
        id: s.id,
        name: s.name,
        makerName: s.seller?.displayName ?? 'Unknown HomeKrafter',
        submittedAt: (s.submittedAt ?? new Date(0)).toISOString(),
        imageSrc: s.imageSrc ?? undefined,
        editHref: undefined,
      })),
      ...mealPlans.map((m) => ({
        kind: 'mealPlan' as const,
        id: m.id,
        name: m.name,
        makerName: m.vendor.name,
        submittedAt: (m.submittedAt ?? m.createdAt).toISOString(),
        imageSrc: m.imageSrc ?? undefined,
        editHref: undefined,
      })),
    ].sort((a, b) => a.submittedAt.localeCompare(b.submittedAt));

    return {
      items: items.slice(0, REVIEW_QUEUE_CAP),
      total: productCount + snackCount + mealPlanCount,
      counts: { product: productCount, snack: snackCount, mealPlan: mealPlanCount },
    };
  }

  /**
   * A decision on a snack. Mirrors `moderateProduct` through the shared
   * `moderationDecision` mapping so the two cannot disagree about what
   * `takedown` means.
   */
  async moderateSnack(adminUserId: string, id: string, dto: ModerateProductDto) {
    const existing = await this.prisma.snack.findUnique({
      where: { id },
      include: { seller: { select: { displayName: true, userId: true } } },
    });
    if (!existing) throw new NotFoundException('Menu item not found');

    this.assertReasonGiven(dto);
    const data = moderationDecision(dto.action, adminUserId, dto.reason);
    // `featured` is a Product column; a snack has no merchandising flag,
    // so those two actions have nothing to write here.
    if (data.moderationStatus === undefined) {
      throw new BadRequestException('Featuring is not available for menu items');
    }
    delete data.featured;
    delete data.featuredRank;

    const updated = await this.prisma.snack.update({ where: { id }, data });
    await this.recordDecision('snack', 'Snack', id, adminUserId, dto, existing.moderationStatus, updated.moderationStatus, {
      userId: existing.seller?.userId,
      name: existing.name,
    });
    return mapSnackForOwner(updated);
  }

  /** A decision on a meal plan. Same shape and same rules as a snack. */
  async moderateMealPlan(adminUserId: string, id: string, dto: ModerateProductDto) {
    const existing = await this.prisma.mealPlan.findUnique({
      where: { id },
      include: { vendor: { select: { name: true, seller: { select: { userId: true } } } } },
    });
    if (!existing) throw new NotFoundException('Meal plan not found');

    this.assertReasonGiven(dto);
    const data = moderationDecision(dto.action, adminUserId, dto.reason);
    if (data.moderationStatus === undefined) {
      throw new BadRequestException('Featuring is not available for meal plans');
    }
    delete data.featured;
    delete data.featuredRank;

    const updated = await this.prisma.mealPlan.update({ where: { id }, data });
    await this.recordDecision(
      'mealPlan',
      'MealPlan',
      id,
      adminUserId,
      dto,
      existing.moderationStatus,
      updated.moderationStatus,
      { userId: existing.vendor.seller?.userId, name: existing.name },
    );
    return { id: updated.id, name: updated.name, moderationStatus: updated.moderationStatus };
  }

  /**
   * A refusal without a reason is refused. The reason reaches the
   * HomeKrafter verbatim and is the only thing telling them what to
   * change (M22), so an empty one makes the decision unactionable.
   */
  private assertReasonGiven(dto: ModerateProductDto) {
    if (REFUSING_ACTIONS.includes(dto.action) && !dto.reason?.trim()) {
      throw new BadRequestException(
        'Refusing a listing needs a reason — the HomeKrafter is shown it verbatim and has to be able to act on it',
      );
    }
  }

  /**
   * Audit row + notification, shared by the two new types. Both are
   * required for every decision: the audit log is how the platform
   * answers "who did this", the notification is how the person whose
   * income it affects finds out at all.
   */
  private async recordDecision(
    kind: ModeratableKind,
    targetType: string,
    id: string,
    adminUserId: string,
    dto: ModerateProductDto,
    from: string,
    to: ProductModerationStatus,
    owner: { userId?: string; name: string },
  ) {
    await this.auditLog.log({
      actorId: adminUserId,
      action: `${kind}.${dto.action}`,
      targetType,
      targetId: id,
      metadata: { from, to, reason: dto.reason?.trim() ?? null },
    });

    // `void` — a decision must not roll back because a message failed.
    if (owner.userId) {
      void this.moderationNotifications.productDecided({
        userId: owner.userId,
        productId: id,
        productName: owner.name,
        status: to,
        reason: dto.reason?.trim(),
        kind,
      });
    }
  }

  /** One page, newest first (M37) — this pulled every review ever written, with a name-resolution pass over all of them, on each visit to the moderation screen. */
  async listReviews(page = 1, pageSize = 50) {
    const [reviews, total] = await Promise.all([
      this.prisma.review.findMany({
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.review.count(),
    ]);
    const targetNames = await this.resolveTargetNames(reviews);
    return {
      items: reviews.map((r) => ({ ...mapReview(r), targetName: targetNames.get(`${r.targetType}:${r.targetId}`) ?? 'Unknown' })),
      page,
      pageSize,
      total,
    };
  }

  async moderateReview(adminUserId: string, id: string, hidden: boolean) {
    const existing = await this.prisma.review.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Review not found');

    // Hiding a review has to move the rating it was counted in, or the
    // moderator's action is invisible everywhere a rating is shown — the
    // update and the recompute are transacted together, mirroring
    // `ReviewsService.create`'s identical `create` + `recompute` pair, so
    // a failure between the two can't leave `hidden` persisted while
    // `Product.rating`/`Vendor.rating` still count (or wrongly omit) it.
    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.review.update({ where: { id }, data: { hidden } });
      // `targetType` is a `ReviewTargetType` enum value, which is exactly
      // the union `recompute` takes.
      await this.reviewAggregates.recompute(row.targetType, row.targetId, tx);
      return row;
    });

    await this.auditLog.log({
      actorId: adminUserId,
      action: hidden ? 'review.hide' : 'review.unhide',
      targetType: 'Review',
      targetId: id,
    });

    return mapReview(updated);
  }

  private async resolveTargetNames(reviews: { targetType: string; targetId: string }[]): Promise<Map<string, string>> {
    const productIds = reviews.filter((r) => r.targetType === 'product').map((r) => r.targetId);
    const vendorIds = reviews.filter((r) => r.targetType === 'vendor').map((r) => r.targetId);
    const serviceIds = reviews.filter((r) => r.targetType === 'service').map((r) => r.targetId);

    const [products, vendors, services] = await Promise.all([
      productIds.length ? this.prisma.product.findMany({ where: { id: { in: productIds } }, select: { id: true, name: true } }) : [],
      vendorIds.length ? this.prisma.vendor.findMany({ where: { id: { in: vendorIds } }, select: { id: true, name: true } }) : [],
      serviceIds.length
        ? this.prisma.laundryService.findMany({ where: { id: { in: serviceIds } }, select: { id: true, name: true } })
        : [],
    ]);

    const map = new Map<string, string>();
    for (const p of products) map.set(`product:${p.id}`, p.name);
    for (const v of vendors) map.set(`vendor:${v.id}`, v.name);
    for (const s of services) map.set(`service:${s.id}`, s.name);
    return map;
  }
}
