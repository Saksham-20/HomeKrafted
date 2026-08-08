import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { distanceKm, formatDistanceKm } from '../common/geo';
import { PrismaService } from '../prisma/prisma.service';
import { ListProductsQueryDto } from './dto/list-products.query.dto';
import { PRODUCT_INCLUDE, mapProduct } from './mappers/product.mapper';
import { dietaryTagsFromFrontend } from './dietary-tag.util';
import { splitCsv } from './split-csv.util';
import { PUBLICLY_LISTED, isDirectlyResolvable } from './moderation';

export interface PaginatedResult<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
}

const DEFAULT_PAGE_SIZE = 20;

/**
 * `defaultPriceOf` over the narrow phase-one row, which carries only
 * `{ sku, price }` per weight option rather than the whole relation.
 * Same rule, deliberately spelled out twice rather than widening the
 * phase-one select to satisfy a type: the default option's price, falling
 * back to the first, and 0 for a listing with no options at all.
 */
function slimDefaultPriceOf(product: {
  defaultWeightSku: string;
  weightOptions: { sku: string; price: Prisma.Decimal }[];
}): number {
  const weight =
    product.weightOptions.find((w) => w.sku === product.defaultWeightSku) ?? product.weightOptions[0];
  return weight ? Number(weight.price) : 0;
}

@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * List + filter + sort + paginate — mirrors `ShopClient.tsx`'s client-side
   * filter/sort exactly (see that component's doc comment: this is the
   * seam it says moves server-side once a real paginated API lands).
   * Category/occasion/dietary/vendor are resolved at the DB layer;
   * price-range + distance + sort still run in application code, because
   * neither price (the `defaultWeightSku` option's, not min/any) nor
   * distance is a column — see the two phases inside.
   */
  async list(query: ListProductsQueryDto): Promise<PaginatedResult<ReturnType<typeof mapProduct>>> {
    // Allowlist, not `{ not: 'hidden' }` — see `moderation.ts`. With the
    // old denylist, M22's `pending` would have been public and the review
    // gate would have done nothing visible enough to notice.
    const where: Prisma.ProductWhereInput = { ...PUBLICLY_LISTED };

    // Buyers never see something the kitchen has switched off for the day.
    // An explicit `availableOnly=false` is how the seller portal and admin
    // fetch their own full list including paused items.
    if (query.availableOnly !== false) {
      where.isAvailable = true;
    }

    // Free-text search. Every term has to match *somewhere* on the row
    // (AND across terms, OR across fields), which is what makes "mango
    // pickle" narrower than "mango" rather than wider — the opposite of
    // OR-ing the terms, and the behaviour people expect from a search box.
    if (query.q) {
      const terms = query.q.split(/\s+/).filter(Boolean).slice(0, 6);
      if (terms.length > 0) {
        where.AND = terms.map((term) => ({
          OR: [
            { name: { contains: term, mode: 'insensitive' as const } },
            { description: { contains: term, mode: 'insensitive' as const } },
            { category: { name: { contains: term, mode: 'insensitive' as const } } },
            { vendor: { name: { contains: term, mode: 'insensitive' as const } } },
          ],
        }));
      }
    }

    if (query.category) {
      where.category = { slug: { in: splitCsv(query.category) } };
    }
    if (query.occasion) {
      where.occasions = { some: { occasion: { slug: { in: splitCsv(query.occasion) } } } };
    }
    if (query.vendor) {
      where.vendor = { slug: { in: splitCsv(query.vendor) } };
    }
    if (query.dietary) {
      where.dietary = { hasSome: dietaryTagsFromFrontend(splitCsv(query.dietary)) };
    }
    if (query.featured !== undefined) {
      where.featured = query.featured;
    }
    if (query.isHamper !== undefined) {
      where.isHamper = query.isHamper;
    }
    if (query.kind !== undefined) {
      where.kind = query.kind;
    }

    const sortMode = query.sort ?? 'most-loved';
    const buyerCoords =
      query.lat !== undefined && query.lng !== undefined
        ? { lat: query.lat, lng: query.lng }
        : undefined;

    /**
     * **The fast path: everything in SQL, twenty rows touched.**
     *
     * The two phases below exist because price and distance are derived,
     * so they cannot be filtered or sorted in the database. But the
     * *default browse* — no search term, no price range, no coordinates,
     * `most-loved` ordering — uses none of that. It is `ORDER BY rating
     * DESC, reviewCount DESC, id ASC` with a `LIMIT`, which Postgres does
     * over an index without reading the catalogue.
     *
     * Measured, because the phased version looked fast enough on seeded
     * data and was not: against 16 products a k6 ramp to 1000 VUs held
     * p95 at 4.55 ms; against 2,017 products the same ramp gave **p95
     * 2.06 s** and tripped the threshold. A single request was still only
     * 40 ms — the cost was reading two thousand rows to return twenty,
     * multiplied by concurrency until the pool queued. This is the request
     * every visitor makes first, so it is the one worth a special case.
     *
     * The condition is deliberately narrow. Anything that needs a derived
     * value falls through to the general path below, which is still
     * correct — just slower, and far rarer.
     */
    const canPageInSql =
      !query.q &&
      query.minPrice === undefined &&
      query.maxPrice === undefined &&
      !buyerCoords &&
      sortMode === 'most-loved';

    if (canPageInSql) {
      const page = query.page ?? 1;
      const pageSize = query.pageSize ?? DEFAULT_PAGE_SIZE;
      const [rows, total] = await Promise.all([
        this.prisma.product.findMany({
          where,
          include: PRODUCT_INCLUDE,
          // Identical to the JavaScript comparator's `most-loved` branch,
          // final `id` key included — the two paths must not disagree
          // about ordering, or a page boundary shifts depending on which
          // one served it.
          orderBy: [{ rating: 'desc' }, { reviewCount: 'desc' }, { id: 'asc' }],
          skip: (page - 1) * pageSize,
          take: pageSize,
        }),
        this.prisma.product.count({ where }),
      ]);
      return { items: rows.map((row) => mapProduct(row)), page, pageSize, total };
    }

    /**
     * **Phase one: the smallest row that can answer every derived filter
     * and sort.**
     *
     * Price and distance are not columns — price is the `defaultWeightSku`
     * option's price, distance is haversine against the kitchen — so
     * neither can be filtered or sorted in SQL without PostGIS or a
     * denormalised column. That much is unavoidable and unchanged.
     *
     * What *was* avoidable: this used to hydrate the entire matching
     * catalogue with every relation — images, weight options, occasions,
     * category, vendor — and then throw away all but twenty rows. The
     * relations are the expensive part, and none of them are consulted by
     * any filter or comparator below. So the wide read now happens once,
     * against the page, in phase two.
     */
    const candidates = await this.prisma.product.findMany({
      where,
      select: {
        id: true,
        name: true,
        rating: true,
        reviewCount: true,
        shippingScope: true,
        defaultWeightSku: true,
        weightOptions: { select: { sku: true, price: true } },
        // Not in the shared PRODUCT_INCLUDE — wanted here purely for
        // lat/lng/deliveryRadiusKm, which the distance filter needs.
        vendor: { select: { lat: true, lng: true, deliveryRadiusKm: true } },
      },
    });

    // "Near me": keep only kitchens whose own delivery radius reaches the
    // buyer, and remember how far each one is so the card can show it.
    // Filtering here rather than in SQL because there's no PostGIS and the
    // candidate set is one row per HomeKrafter — see `common/geo.ts`.
    const buyer = buyerCoords;

    const distanceByProduct = new Map<string, number>();
    let inRange = candidates;
    if (buyer) {
      inRange = candidates.filter((p) => {
        const v = p.vendor;
        if (!v) return false;
        // M20: a nationally-shipped listing is not radius-eligible at all.
        // A candle goes in the post, so the kitchen's delivery radius —
        // which describes how far somebody will *drive* a hot meal — says
        // nothing about whether it can reach this buyer. Distance is still
        // computed for display where it is meaningful, but it never
        // excludes.
        const km = distanceKm(buyer, { lat: v.lat, lng: v.lng });
        if (p.shippingScope === 'national') {
          distanceByProduct.set(p.id, km);
          return true;
        }
        if (km > v.deliveryRadiusKm) return false;
        distanceByProduct.set(p.id, km);
        return true;
      });
    }

    let withPrice = inRange.map((p) => ({ product: p, price: slimDefaultPriceOf(p) }));

    if (query.minPrice !== undefined) {
      withPrice = withPrice.filter((x) => x.price >= query.minPrice!);
    }
    if (query.maxPrice !== undefined) {
      withPrice = withPrice.filter((x) => x.price <= query.maxPrice!);
    }

    const sort = sortMode;
    // A search hit in the product's own name beats one that only matched
    // its description or its kitchen's name, whatever the sort. Applied
    // ahead of the chosen sort rather than instead of it, so "price: low
    // to high" over a search still means what it says within each tier.
    const needle = query.q?.toLowerCase();
    const nameHit = (name: string) => (needle && name.toLowerCase().includes(needle) ? 0 : 1);
    withPrice.sort((a, b) => {
      if (needle) {
        const hitDelta = nameHit(a.product.name) - nameHit(b.product.name);
        if (hitDelta !== 0) return hitDelta;
      }
      if (sort === 'price-asc') return a.price - b.price;
      if (sort === 'price-desc') return b.price - a.price;
      if (sort === 'nearest' && buyer) {
        return (distanceByProduct.get(a.product.id) ?? 0) - (distanceByProduct.get(b.product.id) ?? 0);
      }
      const ratingDelta = Number(b.product.rating) - Number(a.product.rating);
      if (ratingDelta !== 0) return ratingDelta;
      const reviewDelta = b.product.reviewCount - a.product.reviewCount;
      if (reviewDelta !== 0) return reviewDelta;
      // Every comparator above can tie, and until this line the order
      // within a tie was whatever `findMany` happened to return — which
      // Postgres does not promise to be the same twice. Paging through a
      // catalogue where a hundred new listings all sit at rating 0,
      // reviewCount 0 could therefore show a product on page 2 and again
      // on page 3, and skip another entirely. A unique final key is what
      // makes pagination stable at all.
      return a.product.id < b.product.id ? -1 : a.product.id > b.product.id ? 1 : 0;
    });

    const total = withPrice.length;
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? DEFAULT_PAGE_SIZE;
    const start = (page - 1) * pageSize;
    const pageIds = withPrice.slice(start, start + pageSize).map((x) => x.product.id);
    if (pageIds.length === 0) return { items: [], page, pageSize, total };

    // **Phase two: hydrate only the page.** `findMany` returns no
    // particular order for an `in` list, so the ordering settled above is
    // reapplied here rather than assumed.
    const rows = await this.prisma.product.findMany({
      where: { id: { in: pageIds } },
      include: PRODUCT_INCLUDE,
    });
    const byId = new Map(rows.map((row) => [row.id, row]));

    const items = pageIds.flatMap((id) => {
      const row = byId.get(id);
      if (!row) return [];
      const km = distanceByProduct.get(id);
      return [
        {
          ...mapProduct(row),
          ...(km !== undefined
            ? { distanceKm: Math.round(km * 10) / 10, distanceLabel: formatDistanceKm(km) }
            : {}),
        },
      ];
    });

    return { items, page, pageSize, total };
  }

  /**
   * A direct-link/cart/order/wishlist lookup must still resolve for a
   * **taken-down** product — matches `lib/api/products.ts#getProduct`'s
   * doc comment, and is why this is not simply `PUBLICLY_LISTED`. An order
   * somebody placed has to keep rendering after an admin hides the listing.
   *
   * M22 draws one line through that: `pending` and `rejected` 404. Those
   * have never been public, so nothing legitimately links to them — and
   * without this check the whole gate is bypassable by guessing a slug,
   * which for a slugified product name is not guessing at all.
   */
  async getBySlug(slug: string): Promise<ReturnType<typeof mapProduct>> {
    const product = await this.prisma.product.findUnique({ where: { slug }, include: PRODUCT_INCLUDE });
    if (!product || !isDirectlyResolvable(product.moderationStatus)) {
      throw new NotFoundException('Product not found');
    }
    return mapProduct(product);
  }
}
