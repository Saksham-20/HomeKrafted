import { NotFoundException } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { activeDiscountPct, applyDiscount } from '../../catalog/vendor-discount';
import { dietaryTagsToFrontend } from '../../catalog/dietary-tag.util';

/**
 * Resolves a raw `CartItem` row (product-or-hamper polymorphic, see
 * `schema.prisma`'s comment on `CartItem`) into display + pricing data —
 * the one place `CartService.getCart` and `OrdersService.create` both
 * derive a line's `unitPrice`/`lineTotal` from, so a cart preview and the
 * order actually created from it can never disagree. Every price comes
 * from `WeightOption.price`/`HamperBox.price` read fresh from the DB here
 * — nothing about pricing is ever read from the `CartItem` row itself
 * (it doesn't store one) or trusted from a client-submitted amount.
 */

type Db = PrismaClient | Prisma.TransactionClient;

export interface RawCartItem {
  id: string;
  productId: string | null;
  sku: string | null;
  hamperId: string | null;
  quantity: number;
  giftWrap: boolean;
  addressId: string | null;
}

export interface ResolvedLine {
  id: string;
  productId?: string;
  sku?: string;
  hamperId?: string;
  quantity: number;
  giftWrap: boolean;
  addressId?: string;
  name: string;
  imagePlaceholder: string;
  imageSrc?: string;
  imageRatio: string;
  weightLabel?: string;
  unitPrice: number;
  lineTotal: number;
  /**
   * The price before the HomeKrafter's storefront discount (M46), present
   * only when one applied. The cart strikes this through; `unitPrice` is
   * what is actually charged.
   */
  listUnitPrice?: number;
  /** The storefront discount that produced `unitPrice`, when one applied. */
  discountPct?: number;
  isHamper: boolean;
  /** Stock cap for a product line — omitted (unbounded) for hamper lines. */
  maxQuantity?: number;
  /**
   * What the line is (2026-09-15) — checkout lays itself out for food or
   * for gifts from this. A hamper line is `craft`: it is assembled to give.
   */
  kind: 'food' | 'craft';
  /** Frontend spelling (`non-vegetarian`), so checkout draws the same diet mark the card does. */
  dietary: string[];
  /**
   * Who made it — name, slug and the coarse public area label only. Never
   * the pickup address (M36b): this payload is the buyer's.
   */
  maker?: { name: string; slug: string; location: string };
}

export async function resolveCartLine(db: Db, item: RawCartItem): Promise<ResolvedLine> {
  if (item.hamperId) {
    const hamper = await db.hamper.findUnique({
      where: { id: item.hamperId },
      include: {
        box: true,
        items: {
          include: {
            product: {
              include: { weightOptions: true, vendor: { select: { name: true, slug: true, location: true } } },
            },
          },
        },
      },
    });
    if (!hamper) {
      throw new NotFoundException(`Hamper ${item.hamperId} referenced by cart item ${item.id} not found`);
    }

    const itemsTotal = hamper.items.reduce((sum, hamperItem) => {
      const weight =
        hamperItem.product.weightOptions.find((w) => w.sku === hamperItem.product.defaultWeightSku) ??
        hamperItem.product.weightOptions[0];
      return sum + (weight ? Number(weight.price) : 0) * hamperItem.quantity;
    }, 0);
    const unitPrice = Number(hamper.box.price) + itemsTotal;

    return {
      id: item.id,
      hamperId: item.hamperId,
      quantity: item.quantity,
      giftWrap: item.giftWrap,
      addressId: item.addressId ?? undefined,
      name: `${hamper.box.name} Gift Hamper`,
      imagePlaceholder: 'Assembled gift hamper',
      imageSrc: '/images/site/hero-hamper.jpg',
      imageRatio: '1/1',
      unitPrice,
      lineTotal: unitPrice * item.quantity,
      isHamper: true,
      kind: 'craft',
      dietary: [],
      ...(hamper.items[0]
        ? {
            maker: {
              name: hamper.items[0].product.vendor.name,
              slug: hamper.items[0].product.vendor.slug,
              location: hamper.items[0].product.vendor.location,
            },
          }
        : {}),
    };
  }

  if (!item.productId) {
    throw new NotFoundException(`Cart item ${item.id} has neither a product nor a hamper reference`);
  }

  const product = await db.product.findUnique({
    where: { id: item.productId },
    include: {
      images: { orderBy: { sortOrder: 'asc' } },
      weightOptions: true,
      // M46 — the storefront discount is applied here, in the one place a
      // line price is derived, so a cart preview and the order created
      // from it can never disagree about it either.
      vendor: { select: { discountPct: true, discountEndsAt: true, name: true, slug: true, location: true } },
    },
  });
  if (!product) {
    throw new NotFoundException(`Product ${item.productId} referenced by cart item ${item.id} not found`);
  }

  const weight = product.weightOptions.find((w) => w.sku === item.sku) ?? product.weightOptions[0];
  const listUnitPrice = weight ? Number(weight.price) : 0;

  // Read against a single `now` for the whole line rather than letting
  // each helper call `new Date()` — a discount expiring mid-request would
  // otherwise strike a price through and charge the full amount.
  const discountPct = activeDiscountPct(product.vendor, new Date());
  const unitPrice = applyDiscount(listUnitPrice, discountPct);

  return {
    id: item.id,
    productId: item.productId,
    sku: weight?.sku,
    quantity: item.quantity,
    giftWrap: item.giftWrap,
    addressId: item.addressId ?? undefined,
    name: product.name,
    imagePlaceholder: product.images[0]?.placeholder ?? product.name,
    imageSrc: product.images[0]?.src ?? undefined,
    imageRatio: product.images[0]?.ratio ?? '1/1',
    weightLabel: weight?.label,
    unitPrice,
    lineTotal: unitPrice * item.quantity,
    ...(discountPct > 0 ? { listUnitPrice, discountPct } : {}),
    isHamper: false,
    maxQuantity: weight?.stock,
    kind: product.kind === 'food' ? 'food' : 'craft',
    dietary: dietaryTagsToFrontend(product.dietary),
    maker: { name: product.vendor.name, slug: product.vendor.slug, location: product.vendor.location },
  };
}
