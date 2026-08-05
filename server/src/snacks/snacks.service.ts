import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { distanceKm, formatDistanceKm } from '../common/geo';
import { ListSnacksQueryDto } from './dto/list-snacks.query.dto';
import { mapSnack } from './snacks.mapper';

/**
 * Snacks menu — `@Public()` reads only (browsable per `lib/channel.ts`,
 * "Browse web: yes"). Consumer ordering is WhatsApp-only ("Cart web: no")
 * — there is deliberately no `POST /snacks/order`/`snack-list` endpoint
 * here; a `SnackList` never becomes a server-side domain entity, it just
 * formats a `wa.me` message client-side (see
 * `client/lib/types/food.ts#SnackList`'s doc comment). `SnackOrder` (the
 * seller-side record of an inbound WhatsApp order) has read endpoints
 * seamed for **M8.3b** (seller portal) — **M9** (WhatsApp Cloud API)
 * owns actually writing those rows from real inbound messages; neither
 * is built here.
 */
@Injectable()
export class SnacksService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Listings a HomeKrafter has put on the snacks menu (M20, `isSnack`).
   *
   * The menu is no longer only the `Snack` table. That table is a second
   * catalogue with its own availability, its own nullable seller and its
   * own missing moderation — the exact duplication M18 avoided by making a
   * hamper a `Product` flag. New items go through `Product`; the seeded
   * `Snack` rows keep working and keep being served alongside them, so
   * nothing anybody already listed disappears.
   */
  private async listFlaggedProducts(query: ListSnacksQueryDto) {
    const terms = query.q ? query.q.split(/\s+/).filter(Boolean).slice(0, 6) : [];

    const products = await this.prisma.product.findMany({
      where: {
        isSnack: true,
        isAvailable: true,
        moderationStatus: 'active',
        ...(terms.length > 0
          ? {
              AND: terms.map((term) => ({
                OR: [
                  { name: { contains: term, mode: 'insensitive' as const } },
                  { description: { contains: term, mode: 'insensitive' as const } },
                ],
              })),
            }
          : {}),
      },
      // A `Product` has no direct `seller` — ownership runs through the
      // vendor, which is also where the coordinates for the radius filter
      // live.
      include: { vendor: { include: { seller: true } }, weightOptions: true },
      orderBy: { name: 'asc' },
    });

    return products.map((product) => {
      const option =
        product.weightOptions.find((w) => w.sku === product.defaultWeightSku) ??
        product.weightOptions[0];
      return {
        id: product.id,
        slug: product.slug,
        name: product.name,
        description: product.description,
        price: option ? Number(option.price) : 0,
        // The `Snack` table's own category enum does not apply to a
        // `Product`; the taxonomy that does is `Category`. Reported as the
        // generic bucket rather than guessing a wrong one.
        category: 'savoury' as const,
        /**
         * Veg **only** when the kitchen said so explicitly.
         *
         * `DietaryTag` has no "non-veg" member, so an untagged listing is
         * genuinely unknown. The two ways of guessing are not symmetric: a
         * vegetarian buyer relies on this label, so calling an untagged item
         * veg is a claim that can be wrong in a way that matters. Calling a
         * veg item non-veg is only unhelpful. Fail towards the harmless one.
         */
        diet:
          product.dietary.includes('vegetarian') || product.dietary.includes('vegan')
            ? ('veg' as const)
            : ('non_veg' as const),
        imagePlaceholder: product.name,
        imageSrc: undefined,
        available: product.isAvailable,
        sellerId: product.vendor.seller?.id,
        vendor: product.vendor,
      };
    });
  }

  async list(query: ListSnacksQueryDto) {
    // AND across terms, OR across fields — see `ProductsService.list`.
    const terms = query.q ? query.q.split(/\s+/).filter(Boolean).slice(0, 6) : [];
    const snacks = await this.prisma.snack.findMany({
      where: {
        available: true,
        category: query.category,
        ...(terms.length > 0
          ? {
              AND: terms.map((term) => ({
                OR: [
                  { name: { contains: term, mode: 'insensitive' as const } },
                  { description: { contains: term, mode: 'insensitive' as const } },
                ],
              })),
            }
          : {}),
      },
      // Seller joined for its vendor's coordinates — the "near me" filter.
      include: { seller: { include: { vendor: true } } },
      orderBy: { name: 'asc' },
    });

    // Listings a kitchen flagged onto the menu (M20) sit alongside the
    // seeded `Snack` rows. `category` filters only apply to the legacy
    // table, which is the only one that carries that enum.
    const flagged = query.category ? [] : await this.listFlaggedProducts(query);

    const buyer =
      query.lat !== undefined && query.lng !== undefined
        ? { lat: query.lat, lng: query.lng }
        : undefined;

    if (!buyer) {
      return [
        ...snacks.map((s) => mapSnack(s)),
        ...flagged.map(({ vendor: _vendor, ...rest }) => rest),
      ].sort((a, b) => a.name.localeCompare(b.name));
    }

    const nearbySnacks = snacks
      .map((snack) => {
        const vendor = snack.seller?.vendor;
        // A snack with no kitchen attached can't be placed on the map, so
        // it can't be promised to anyone in particular — leave it out of a
        // location-filtered list rather than guess.
        if (!vendor) return null;
        const km = distanceKm(buyer, { lat: vendor.lat, lng: vendor.lng });
        if (km > vendor.deliveryRadiusKm) return null;
        return {
          ...mapSnack(snack),
          distanceKm: Math.round(km * 10) / 10,
          distanceLabel: formatDistanceKm(km),
        };
      })
      .filter((s): s is NonNullable<typeof s> => s !== null);

    const nearbyFlagged = flagged
      .map(({ vendor, ...rest }) => {
        const km = distanceKm(buyer, { lat: vendor.lat, lng: vendor.lng });
        if (km > vendor.deliveryRadiusKm) return null;
        return {
          ...rest,
          distanceKm: Math.round(km * 10) / 10,
          distanceLabel: formatDistanceKm(km),
        };
      })
      .filter((s): s is NonNullable<typeof s> => s !== null);

    return [...nearbySnacks, ...nearbyFlagged].sort((a, b) => a.distanceKm - b.distanceKm);
  }

  async getBySlug(slug: string) {
    const snack = await this.prisma.snack.findUnique({ where: { slug } });
    if (!snack) throw new NotFoundException('Snack not found');
    return mapSnack(snack);
  }
}
