import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { distanceKm, formatDistanceKm } from '../common/geo';
import { PrismaService } from '../prisma/prisma.service';
import { ListProductsQueryDto } from './dto/list-products.query.dto';
import { PRODUCT_INCLUDE, defaultPriceOf, mapProduct } from './mappers/product.mapper';
import { dietaryTagsFromFrontend } from './dietary-tag.util';
import { splitCsv } from './split-csv.util';

export interface PaginatedResult<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
}

const DEFAULT_PAGE_SIZE = 20;

@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * List + filter + sort + paginate — mirrors `ShopClient.tsx`'s client-side
   * filter/sort exactly (see that component's doc comment: this is the
   * seam it says moves server-side once a real paginated API lands).
   * Category/occasion/dietary/vendor are resolved at the DB layer;
   * price-range + sort + pagination run in application code against the
   * (small) already-filtered result set, same basis `ShopClient`'s local
   * `priceOf()` uses (the `defaultWeightSku` price, not min/any option).
   */
  async list(query: ListProductsQueryDto): Promise<PaginatedResult<ReturnType<typeof mapProduct>>> {
    const where: Prisma.ProductWhereInput = { moderationStatus: { not: 'hidden' } };

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

    const products = await this.prisma.product.findMany({
      where,
      // `vendor` joined here (not in the shared PRODUCT_INCLUDE) purely for
      // its lat/lng/deliveryRadiusKm — the distance filter below needs them.
      include: { ...PRODUCT_INCLUDE, vendor: true },
    });

    // "Near me": keep only kitchens whose own delivery radius reaches the
    // buyer, and remember how far each one is so the card can show it.
    // Filtering here rather than in SQL because there's no PostGIS and the
    // candidate set is one row per HomeKrafter — see `common/geo.ts`.
    const buyer =
      query.lat !== undefined && query.lng !== undefined
        ? { lat: query.lat, lng: query.lng }
        : undefined;

    const distanceByProduct = new Map<string, number>();
    let inRange = products;
    if (buyer) {
      inRange = products.filter((p) => {
        const v = p.vendor;
        if (!v) return false;
        const km = distanceKm(buyer, { lat: v.lat, lng: v.lng });
        if (km > v.deliveryRadiusKm) return false;
        distanceByProduct.set(p.id, km);
        return true;
      });
    }

    let withPrice = inRange.map((p) => ({ product: p, price: defaultPriceOf(p) }));

    if (query.minPrice !== undefined) {
      withPrice = withPrice.filter((x) => x.price >= query.minPrice!);
    }
    if (query.maxPrice !== undefined) {
      withPrice = withPrice.filter((x) => x.price <= query.maxPrice!);
    }

    const sort = query.sort ?? 'most-loved';
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
      return b.product.reviewCount - a.product.reviewCount;
    });

    const total = withPrice.length;
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? DEFAULT_PAGE_SIZE;
    const start = (page - 1) * pageSize;
    const items = withPrice.slice(start, start + pageSize).map((x) => {
      const km = distanceByProduct.get(x.product.id);
      return {
        ...mapProduct(x.product),
        ...(km !== undefined
          ? { distanceKm: Math.round(km * 10) / 10, distanceLabel: formatDistanceKm(km) }
          : {}),
      };
    });

    return { items, page, pageSize, total };
  }

  /**
   * No `moderationStatus` filter here on purpose — matches
   * `lib/api/products.ts#getProduct`'s doc comment: a direct-link/cart/
   * order/wishlist lookup must still resolve even for a taken-down
   * product; only browse/listing surfaces hide it.
   */
  async getBySlug(slug: string): Promise<ReturnType<typeof mapProduct>> {
    const product = await this.prisma.product.findUnique({ where: { slug }, include: PRODUCT_INCLUDE });
    if (!product) throw new NotFoundException('Product not found');
    return mapProduct(product);
  }
}
