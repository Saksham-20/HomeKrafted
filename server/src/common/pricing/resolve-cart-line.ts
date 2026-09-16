import { NotFoundException } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { activeDiscountPct, applyDiscount } from '../../catalog/vendor-discount';
import { dietaryTagsToFrontend } from '../../catalog/dietary-tag.util';
import { CommissionRate, markUp } from './commission';

/**
 * Resolves raw `CartItem` rows (product-or-hamper polymorphic, see
 * `schema.prisma`'s comment on `CartItem`) into display + pricing data —
 * the one place `CartService.getCart` and `OrdersService.create` both
 * derive a line's `unitPrice`/`lineTotal` from, so a cart preview and the
 * order actually created from it can never disagree. Every price comes
 * from `WeightOption.price`/`HamperBox.price` read fresh from the DB here
 * — nothing about pricing is ever read from the `CartItem` row itself
 * (it doesn't store one) or trusted from a client-submitted amount.
 */

type Db = PrismaClient | Prisma.TransactionClient;

/**
 * Line totals are rounded to paise. `unitPrice` is already rounded, but
 * `12.35 * 3` is `37.049999999999997` in binary floating point, and that
 * value summed into `Order.subtotal` is what a Decimal(12,2) column
 * rounds on the way in — so the basket and the order could differ by a
 * paisa on a long cart. Rounding here keeps them identical.
 */
const round2 = (value: number): number => Math.round(value * 100) / 100;

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
  /**
   * What the buyer is charged per unit — the maker's base after any
   * storefront discount, **plus** the commission and the GST on it
   * (2026-09-16). This is the figure that sums to `Order.subtotal` and the
   * figure the basket shows.
   */
  unitPrice: number;
  lineTotal: number;
  /**
   * The split behind `unitPrice`, per unit, so `OrdersService.create` can
   * record on the order line what the maker earns and what the platform
   * charged.
   *
   * **Computed here rather than at order time on purpose.** This is the
   * one function a cart preview and the order created from it both go
   * through, which is the whole reason it exists — deriving the split
   * anywhere else reintroduces exactly the drift `resolveCartLine` was
   * written to prevent.
   */
  unitSellerAmount: number;
  unitCommission: number;
  unitGst: number;
  /** The rates *applied* — 0 when nothing was charged, never the configured rate. */
  commissionPct: number;
  gstPct: number;
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

const HAMPER_INCLUDE = {
  box: true,
  items: {
    include: {
      product: {
        include: { weightOptions: true, vendor: { select: { name: true, slug: true, location: true } } },
      },
    },
  },
} satisfies Prisma.HamperInclude;

const CART_PRODUCT_INCLUDE = {
  images: { orderBy: { sortOrder: 'asc' as const } },
  weightOptions: true,
  // M46 — the storefront discount is applied here, in the one place a
  // line price is derived, so a cart preview and the order created
  // from it can never disagree about it either.
  vendor: { select: { discountPct: true, discountEndsAt: true, name: true, slug: true, location: true } },
} satisfies Prisma.ProductInclude;

type LoadedProduct = Prisma.ProductGetPayload<{ include: typeof CART_PRODUCT_INCLUDE }>;
type LoadedHamper = Prisma.HamperGetPayload<{ include: typeof HAMPER_INCLUDE }>;

/**
 * Resolve a whole basket in **two** queries — one for every product it
 * references, one for every hamper — instead of one per line.
 *
 * It was `Promise.all(items.map(resolveCartLine))`, which is a `findUnique`
 * per line: a 12-item basket opened 12 connections against the pool for a
 * set of rows a single `IN` clause answers, and `OrdersService.create`
 * did it again *inside* the order transaction, holding that transaction
 * open across all of them. Concurrency hid it on a developer's laptop
 * and would not have hidden it on one vCPU.
 *
 * `now` is read **once** for the whole basket, so two lines from the same
 * storefront cannot land on opposite sides of a discount expiring
 * mid-request — the same rule the single-line version already applied
 * within one line, extended to the basket that is priced as a unit.
 */
export async function resolveCartLines(
  db: Db,
  items: RawCartItem[],
  rate: CommissionRate,
): Promise<ResolvedLine[]> {
  if (items.length === 0) return [];

  const productIds = [...new Set(items.map((i) => i.productId).filter((id): id is string => !!id))];
  const hamperIds = [...new Set(items.map((i) => i.hamperId).filter((id): id is string => !!id))];

  const [products, hampers] = await Promise.all([
    productIds.length > 0
      ? db.product.findMany({ where: { id: { in: productIds } }, include: CART_PRODUCT_INCLUDE })
      : Promise.resolve([] as LoadedProduct[]),
    hamperIds.length > 0
      ? db.hamper.findMany({ where: { id: { in: hamperIds } }, include: HAMPER_INCLUDE })
      : Promise.resolve([] as LoadedHamper[]),
  ]);

  const productById = new Map(products.map((p) => [p.id, p]));
  const hamperById = new Map(hampers.map((h) => [h.id, h]));
  const now = new Date();

  return items.map((item) => resolveLine(item, rate, now, productById, hamperById));
}

function resolveLine(
  item: RawCartItem,
  rate: CommissionRate,
  now: Date,
  productById: Map<string, LoadedProduct>,
  hamperById: Map<string, LoadedHamper>,
): ResolvedLine {
  if (item.hamperId) {
    const hamper = hamperById.get(item.hamperId);
    if (!hamper) {
      throw new NotFoundException(`Hamper ${item.hamperId} referenced by cart item ${item.id} not found`);
    }

    const itemsTotal = hamper.items.reduce((sum, hamperItem) => {
      const weight =
        hamperItem.product.weightOptions.find((w) => w.sku === hamperItem.product.defaultWeightSku) ??
        hamperItem.product.weightOptions[0];
      return sum + (weight ? Number(weight.price) : 0) * hamperItem.quantity;
    }, 0);
    const hamperBase = Number(hamper.box.price) + itemsTotal;
    // A hamper is a legacy row — `POST /cart/hamper-items` is the only
    // writer left and no new `HamperBox` can be created (M18) — but it is
    // still a maker's goods sold through us, so it takes the fee on the
    // same terms as a product line rather than being a way round it.
    const hamperSplit = markUp(hamperBase, rate);

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
      unitPrice: hamperSplit.buyerPrice,
      lineTotal: round2(hamperSplit.buyerPrice * item.quantity),
      unitSellerAmount: hamperSplit.base,
      unitCommission: hamperSplit.commission,
      unitGst: hamperSplit.gst,
      commissionPct: hamperSplit.pct,
      gstPct: hamperSplit.gstPct,
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

  const product = productById.get(item.productId);
  if (!product) {
    throw new NotFoundException(`Product ${item.productId} referenced by cart item ${item.id} not found`);
  }

  const weight = product.weightOptions.find((w) => w.sku === item.sku) ?? product.weightOptions[0];
  const listUnitPrice = weight ? Number(weight.price) : 0;

  // One `now` for the whole basket, passed in — a discount expiring
  // mid-request would otherwise strike a price through on one line and
  // charge the full amount on the next.
  const discountPct = activeDiscountPct(product.vendor, now);
  /**
   * Discount first, then the fee (2026-09-16), the same order
   * `mapProduct` applies — so the card and the basket agree to the paisa.
   * The maker funds the discount (M46), so it comes off their base; the
   * fee is charged on what they are actually receiving.
   */
  const discountedBase = applyDiscount(listUnitPrice, discountPct);
  const split = markUp(discountedBase, rate);
  const unitPrice = split.buyerPrice;

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
    lineTotal: round2(unitPrice * item.quantity),
    unitSellerAmount: split.base,
    unitCommission: split.commission,
    unitGst: split.gst,
    commissionPct: split.pct,
    gstPct: split.gstPct,
    // Struck through beside `unitPrice`, so it has to be in the same
    // (buyer-facing) terms — a base "was" price next to a marked-up "now"
    // price would advertise a discount nobody is giving.
    ...(discountPct > 0 ? { listUnitPrice: markUp(listUnitPrice, rate).buyerPrice, discountPct } : {}),
    isHamper: false,
    maxQuantity: weight?.stock,
    kind: product.kind === 'food' ? 'food' : 'craft',
    dietary: dietaryTagsToFrontend(product.dietary),
    maker: { name: product.vendor.name, slug: product.vendor.slug, location: product.vendor.location },
  };
}
