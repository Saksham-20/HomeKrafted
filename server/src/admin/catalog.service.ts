import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, ProductModerationStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PRODUCT_INCLUDE, mapProduct } from '../catalog/mappers/product.mapper';
import { mapReview } from '../reviews/reviews.mapper';
import { mapSnackForOwner } from '../snacks/snacks.mapper';
import { ReviewAggregatesService } from '../reviews/review-aggregates.service';
import { AdminAuditLogService } from './audit-log.service';
import { ModerationNotificationsService } from './moderation-notifications.service';
import { ModerateProductDto } from './dto/moderate-product.dto';
import { ListAdminCatalogQueryDto } from './dto/list-admin-catalog.query.dto';
import { moderationDecision, REFUSING_ACTIONS, type ModeratableKind } from '../catalog/moderation';
import { MealPlanDayMenusService } from '../meals/day-menus.service';

const DEFAULT_CATALOG_PAGE_SIZE = 25;

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
  items: (ReturnType<typeof mapProduct> & { vendorName: string; categoryName: string })[];
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
    const [vendors, categories] = await Promise.all([
      vendorIds.length
        ? this.prisma.vendor.findMany({ where: { id: { in: vendorIds } }, select: { id: true, name: true } })
        : Promise.resolve([]),
      // `categoryName` was in the client's `AdminProductSummary` type from
      // the day the screen shipped and was **never sent** by this endpoint
      // — only the mock produced it. Every row on `/admin/catalog` had
      // therefore rendered "Vendor · " with a dangling separator against a
      // real server. Found in the browser during M22, not by reading code.
      categoryIds.length
        ? this.prisma.category.findMany({ where: { id: { in: categoryIds } }, select: { id: true, name: true } })
        : Promise.resolve([]),
    ]);
    const vendorNameById = new Map(vendors.map((v) => [v.id, v.name]));
    const categoryNameById = new Map(categories.map((c) => [c.id, c.name]));

    return {
      items: products.map((p) => ({
        ...mapProduct(p),
        vendorName: vendorNameById.get(p.vendorId) ?? 'Unknown vendor',
        categoryName: categoryNameById.get(p.categoryId) ?? 'Uncategorised',
      })),
      page,
      pageSize,
      total,
      pendingCount,
    };
  }

  async getProduct(id: string) {
    const product = await this.prisma.product.findUnique({ where: { id }, include: PRODUCT_INCLUDE });
    if (!product) throw new NotFoundException('Product not found');
    const [vendor, category] = await Promise.all([
      this.prisma.vendor.findUnique({ where: { id: product.vendorId }, select: { name: true } }),
      this.prisma.category.findUnique({ where: { id: product.categoryId }, select: { name: true } }),
    ]);
    return {
      ...mapProduct(product),
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
      ...mapProduct(updated),
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

    const updated = await this.prisma.review.update({ where: { id }, data: { hidden } });

    // Hiding a review has to move the rating it was counted in, or the
    // moderator's action is invisible everywhere a rating is shown.
    // `targetType` is a `ReviewTargetType` enum value, which is exactly
    // the union `recompute` takes.
    await this.reviewAggregates.recompute(updated.targetType, updated.targetId);

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
