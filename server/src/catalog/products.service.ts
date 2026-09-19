import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { distanceKm, formatDistanceKm } from '../common/geo';
import { PrismaService } from '../prisma/prisma.service';
import { ListProductsQueryDto } from './dto/list-products.query.dto';
import { PRODUCT_INCLUDE, defaultPriceOf, mapProduct } from './mappers/product.mapper';
import { AdminSettingsService } from '../admin/settings.service';
import { dietaryTagsFromFrontend } from './dietary-tag.util';
import { splitCsv } from './split-csv.util';
import { PUBLICLY_LISTED, isDirectlyResolvable } from './moderation';
import { DEFAULT_BROWSE_ORDER, compareDefaultBrowse } from './browse-order';

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
@Injectable()
export class ProductsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: AdminSettingsService,
  ) {}

  /**
   * List + filter + sort + paginate — mirrors `ShopClient.tsx`'s client-side
   * filter/sort exactly (see that component's doc comment: this is the
   * seam it says moves server-side once a real paginated API lands).
   * Category/occasion/dietary/vendor are resolved at the DB layer;
   * price-range + distance + sort still run in application code, because
   * neither price (the `defaultWeightSku` option's, not min/any) nor
   * distance is a column — see the two phases inside.
   */
  /**
   * Every filter in a browse query that a database can answer, as one
   * `where`.
   *
   * Extracted in G1 so the **grid and the facet counts are built from the
   * same object** (`GET /catalog/facets` takes this exact query DTO). Two
   * copies of this logic would drift, and the symptom is a filter promising
   * "12 gifts" over a page showing nine, with nothing to say which is
   * right.
   *
   * Price and distance are deliberately **not** here: neither is a column
   * (price is the `defaultWeightSku` option's, distance is computed per
   * buyer), so both stay in the phased application-side pass in `list`.
   */
  browseWhere(query: ListProductsQueryDto): Prisma.ProductWhereInput {
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
      const slugs = splitCsv(query.category);
      // M58 — two changes here, both load-bearing.
      //
      // 1. Match through `ProductCategory`, not `Product.categoryId`. A
      //    listing may sit on several shelves now, and filtering on the
      //    primary alone would hide it from every other one it claims.
      //    The join carries the primary too, so nothing that matched
      //    before stops matching.
      // 2. A **parent matches its children**. "Shop by recipient" with
      //    nothing filed directly under it would otherwise be a shelf
      //    that renders empty for everybody who clicks it, which reads as
      //    a broken site rather than an empty category.
      where.categories = {
        some: {
          category: {
            OR: [{ slug: { in: slugs } }, { parent: { slug: { in: slugs } } }],
          },
        },
      };
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

    // G1 — the gift facets (GIFTING-REWORK §3.2). Each is AND-ed onto the
    // query; the values inside one are OR-ed. `attr` is a record of
    // attribute key to comma-separated option values.
    const attrFilters: Record<string, string[]> = {};
    for (const [key, raw] of Object.entries(query.attr ?? {})) {
      if (typeof raw !== 'string') continue;
      const values = splitCsv(raw);
      if (values.length > 0) attrFilters[key] = values;
    }
    if (query.recipient) {
      // The gift finder's own spelling of `attr[recipient]`.
      attrFilters.recipient = [...(attrFilters.recipient ?? []), ...splitCsv(query.recipient)];
    }
    const attrConditions = Object.entries(attrFilters).map(([key, values]) => ({
      // One `some` per attribute is what makes this an intersection: a
      // single `some` naming every option would match a listing that
      // answered any one of them, which is the union bug this replaces.
      attributeValues: {
        some: { attribute: { is: { key } }, option: { is: { value: { in: values } } } },
      },
    }));
    if (attrConditions.length > 0) {
      // `where.AND` is already the free-text search's; keep both.
      const existing = Array.isArray(where.AND) ? where.AND : where.AND ? [where.AND] : [];
      where.AND = [...existing, ...attrConditions];
    }
    if (query.fulfilment !== undefined) {
      // A listing that never answered matches neither value, because the
      // column is NULL and `equals` does not match NULL. That is the
      // intent, not an accident of SQL — see the DTO.
      where.fulfilment = query.fulfilment;
    }
    if (query.personalisable !== undefined) {
      where.isPersonalisable = query.personalisable;
    }

    return where;
  }

  async list(query: ListProductsQueryDto): Promise<PaginatedResult<ReturnType<typeof mapProduct>>> {
    const where = this.browseWhere(query);
    // Once per request, not once per row: a card's price and the price
    // range it was filtered against must come from the same rate, or a
    // listing can be filtered in at one number and rendered at another.
    const rate = await this.settings.getCommissionRate();

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
     * `most-loved` ordering — uses none of that. It is `ORDER BY featured
     * DESC, featuredRank ASC NULLS LAST, rating DESC, reviewCount DESC, id
     * ASC` with a `LIMIT`, which Postgres does over an index
     * (`Product_default_browse_featured_idx`) without reading the
     * catalogue.
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
          // one served it. One constant, `browse-order.ts`, is what stops
          // them drifting; it leads with the admin's featured order.
          orderBy: DEFAULT_BROWSE_ORDER,
          skip: (page - 1) * pageSize,
          take: pageSize,
        }),
        this.prisma.product.count({ where }),
      ]);
      return { items: rows.map((row) => mapProduct(row, rate)), page, pageSize, total };
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
        // The comparator's leading keys (`browse-order.ts`) — without them
        // a located or searching buyer would get the ranking a fast-path
        // buyer does not.
        featured: true,
        featuredRank: true,
        shippingScope: true,
        defaultWeightSku: true,
        weightOptions: { select: { sku: true, price: true } },
        // Not in the shared PRODUCT_INCLUDE — wanted here purely for
        // lat/lng/deliveryRadiusKm, which the distance filter needs.
        vendor: { select: { lat: true, lng: true, deliveryRadiusKm: true } },
      },
      // **A capped read with no order is a nondeterministic read (M41).**
      // `take: 500` shipped without an `orderBy`, and SQL does not promise
      // an order it was not asked for — so *which* 500 rows of a matching
      // 2,000 came back was up to the planner, and two identical requests
      // could return different products. Every located buyer takes this
      // path (`buyerCoords` disqualifies the SQL fast path above), so this
      // was the browse page for anyone who shared their location.
      //
      // Ordering by the same keys as the fast path, final `id` included,
      // for the reason stated there: the two paths must not disagree about
      // ordering, or a page boundary shifts depending on which one served
      // it. Featured first, so the cap keeps an admin's choices before it
      // starts dropping the tail.
      //
      // The honest tradeoff: the cap now keeps the 500 best-rated rather
      // than an arbitrary 500, so a `price-asc` browse of a catalogue past
      // the cap is biased toward well-rated listings rather than cheap
      // ones. That is a defensible 500 instead of an arbitrary one — and
      // the arbitrary version had the same bias problem plus irreproducible
      // results. Revisit with denormalised geo or PostGIS.
      orderBy: DEFAULT_BROWSE_ORDER,
      // Candidate cap (M37): the in-memory distance/sort pass below needs
      // the whole matching set, and without PostGIS that read is unbounded
      // on a table that only grows. 500 slim rows is ~25 pages of the
      // narrowest filter — far past what browsing reaches — and the cap
      // turns a future 50k-listing catalogue from a heap problem into a
      // slightly stale tail.
      take: 500,
    });

    // "Near me": keep only kitchens whose own delivery radius reaches the
    // buyer, and remember how far each one is so the card can show it.
    // Filtering here rather than in SQL because there's no PostGIS and the
    // candidate set is one row per HomeKrafter — see `common/geo.ts`.
    const buyer = buyerCoords;

    const distanceByProduct = new Map<string, number>();
    /**
     * Products kept only because `includeOutOfRange` was asked for. They
     * are beyond their kitchen's delivery radius and are marked
     * `deliverable: false` on the way out, never silently mixed in.
     */
    const outOfRange = new Set<string>();
    const includeOutOfRange = query.includeOutOfRange === true;
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
        if (km > v.deliveryRadiusKm) {
          if (!includeOutOfRange) return false;
          // Kept and labelled. The caller asked to show the whole city and
          // say which half can actually reach this address.
          outOfRange.add(p.id);
          distanceByProduct.set(p.id, km);
          return true;
        }
        distanceByProduct.set(p.id, km);
        return true;
      });
    }

    // The **buyer-facing** price, fee included (2026-09-16) — so "under
    // ₹1,000" filters and `price-asc` sort the numbers on the cards, not
    // the makers' base figures underneath them. `defaultPriceOf` is the
    // shared helper the mapper uses; this file used to carry a private
    // copy of it, which is exactly the shape that drifts.
    let withPrice = inRange.map((p) => ({ product: p, price: defaultPriceOf(p, rate) }));

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
      // The default order — and the tail of every other one: `nearest`
      // with no coordinates falls through to it, as it always did. Featured
      // and its rank lead, then rating, review count and the unique final
      // key that makes pagination stable; all of it lives in
      // `browse-order.ts` so this and the two `orderBy`s cannot disagree.
      return compareDefaultBrowse(a.product, b.product);
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
          ...mapProduct(row, rate),
          ...(km !== undefined
            ? { distanceKm: Math.round(km * 10) / 10, distanceLabel: formatDistanceKm(km) }
            : {}),
          // Only ever `false`, and only when the caller opted in. Absent
          // means "not asked" — never `true` by default, so no existing
          // reader starts branching on a field it has never seen.
          ...(outOfRange.has(id) ? { deliverable: false as const } : {}),
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
    const [product, rate] = await Promise.all([
      this.prisma.product.findUnique({ where: { slug }, include: PRODUCT_INCLUDE }),
      this.settings.getCommissionRate(),
    ]);
    if (!product || !isDirectlyResolvable(product.moderationStatus)) {
      throw new NotFoundException('Product not found');
    }
    return mapProduct(product, rate);
  }
}
