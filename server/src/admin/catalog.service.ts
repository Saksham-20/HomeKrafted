import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PRODUCT_INCLUDE, mapProduct } from '../catalog/mappers/product.mapper';
import { mapReview } from '../reviews/reviews.mapper';
import { ReviewAggregatesService } from '../reviews/review-aggregates.service';
import { AdminAuditLogService } from './audit-log.service';
import { ModerationNotificationsService } from './moderation-notifications.service';
import { ModerateProductDto } from './dto/moderate-product.dto';
import { ListAdminCatalogQueryDto } from './dto/list-admin-catalog.query.dto';

const DEFAULT_CATALOG_PAGE_SIZE = 25;

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
 * Actions that refuse or remove a listing, and therefore owe the
 * HomeKrafter a reason they can act on.
 */
const REFUSING_ACTIONS: ModerateProductDto['action'][] = ['reject', 'hide', 'takedown', 'flag'];

/**
 * Unscoped catalog + review moderation — every `Product` across every
 * vendor, every `Review` across every target. `hide`/`takedown` write the
 * same `moderationStatus: "hidden"` `ProductsService.list`'s public
 * `GET /products` already filters out (`where: { moderationStatus: {
 * not: 'hidden' } }`) — so a hidden product disappears from browse
 * immediately, verified live in this milestone's DoD. `getBySlug` still
 * resolves a hidden product (direct link/cart/order/wishlist lookups must
 * keep working — see `ProductsService.getBySlug`'s doc comment), so
 * "hidden" here means "delisted from browse", not "the row stopped
 * existing".
 */
@Injectable()
export class AdminCatalogService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AdminAuditLogService,
    private readonly reviewAggregates: ReviewAggregatesService,
    private readonly moderationNotifications: ModerationNotificationsService,
  ) {}

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

    // The reason is required here rather than in the DTO because whether
    // it is required depends on the action, which `class-validator`
    // cannot express without a custom validator for one rule.
    if (REFUSING_ACTIONS.includes(dto.action) && !dto.reason?.trim()) {
      throw new BadRequestException(
        'Refusing a listing needs a reason — the HomeKrafter is shown it verbatim and has to be able to act on it',
      );
    }

    const data: Prisma.ProductUncheckedUpdateInput = {};
    if (dto.action === 'approve' || dto.action === 'unhide' || dto.action === 'unflag') {
      data.moderationStatus = 'active';
    }
    if (dto.action === 'reject') data.moderationStatus = 'rejected';
    if (dto.action === 'hide' || dto.action === 'takedown') data.moderationStatus = 'hidden';
    if (dto.action === 'flag') data.moderationStatus = 'flagged';
    if (dto.action === 'feature') data.featured = true;
    if (dto.action === 'unfeature') data.featured = false;

    // `feature`/`unfeature` are not moderation decisions — they are
    // merchandising — so they leave the note and the decision stamp
    // alone. Overwriting them would erase why a listing was flagged
    // because somebody put it on the home page.
    if (data.moderationStatus !== undefined) {
      data.moderatedById = adminUserId;
      data.moderatedAt = new Date();
      // An allowing decision clears the previous refusal's reason; a
      // refusing one records the new reason.
      data.moderationNote = dto.reason?.trim() ?? null;
    }

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

  async listReviews() {
    const reviews = await this.prisma.review.findMany({ orderBy: { createdAt: 'desc' } });
    const targetNames = await this.resolveTargetNames(reviews);
    return reviews.map((r) => ({ ...mapReview(r), targetName: targetNames.get(`${r.targetType}:${r.targetId}`) ?? 'Unknown' }));
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
