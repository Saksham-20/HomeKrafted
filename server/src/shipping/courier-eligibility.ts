import { Prisma, ProductKind } from '@prisma/client';

/**
 * Which listings a courier carries — the one place that decides it
 * (2026-09-06, owner).
 *
 * **A rider is booked for gifts and never for food.** Shadowfax is the
 * long-haul half of this platform: a candle, a print or a hamper is packed
 * into a box and posted, and a courier is the only way it reaches somebody
 * in another city. Cooked food is not that: it is made this morning and
 * driven over by the kitchen that made it, on the schedule the kitchen
 * set, and handing a thali to a third-party rider whose ETA nobody
 * controls is a worse product *and* a food-safety question nobody here has
 * answered. So the food half stays exactly as it was before M57 — the
 * HomeKrafter marks it packed, shipped and delivered themselves, and no
 * `Consignment` row is ever minted for it.
 *
 * `ProductKind.craft` is the predicate on purpose, because it is the same
 * one `/gifts` browses on: what a buyer sees under "Handcrafted Gifts" is
 * exactly what a rider collects, with no third definition of "gift" for
 * anybody to discover later. It is **not** `shippingScope`, which answers
 * a different question — how far a listing may travel — and would have
 * pulled in a jar of pickle marked `national`, which is food. Nor is it
 * `Vendor.type` or `Seller.specialties`: a specialty is a discovery tag
 * that must never decide access (M12), and one kitchen can list both a
 * curry and a candle.
 *
 * **D10 (2026-09-16) put one exception inside that predicate**, and it is
 * still only in this file: chocolates and other edible gifts stayed on the
 * gifts side, so a craft row can now be something that melts. See
 * `EDIBLE_GIFT_DEPARTMENT_SLUG` below.
 *
 * If this ever needs narrowing to long deliveries only, the change is
 * `&& product.shippingScope === national` **here**, and nowhere else —
 * which is the whole reason this is a function and not four inlined
 * `kind === 'craft'` checks.
 */
/**
 * The slug of the edible-gifts department (D10, owner 2026-09-16).
 *
 * Chocolates stayed on the gifts side rather than moving to `food`, which
 * would have taken fourteen live listings off sale while `foodOrdersOpen`
 * is off. So `kind === 'craft'` is no longer the whole predicate: a box of
 * truffles is a craft row that melts in a van.
 *
 * Matched on the **department**, not on a per-listing flag, because that is
 * the fact a maker actually states — they file it under Chocolates, and
 * the shelf is what makes the food questions appear. A listing anywhere
 * under this department (the department itself or one of its children)
 * counts; `ProductCategory` carries the complete set including the primary
 * (M58), so one `some` reaches both.
 */
export const EDIBLE_GIFT_DEPARTMENT_SLUG = 'chocolates-and-edible-gifts';

/** What the two functions below need to see on a listing to decide. */
export interface CourierProductFacts {
  kind: ProductKind;
  /** The maker's declaration that they pack it to survive a van. */
  heatSafePacked?: boolean;
  /** Every shelf it sits on, primary included — `ProductCategory` (M58). */
  categories?: { category: { slug: string; parent?: { slug: string } | null } }[];
}

/** Is this listing filed under the edible-gifts department? */
function isEdibleGift(product: CourierProductFacts): boolean {
  return (product.categories ?? []).some(
    ({ category }) =>
      category.slug === EDIBLE_GIFT_DEPARTMENT_SLUG ||
      category.parent?.slug === EDIBLE_GIFT_DEPARTMENT_SLUG,
  );
}

export function isCourierEligible(product: CourierProductFacts | null | undefined): boolean {
  if (product?.kind !== ProductKind.craft) return false;
  // An edible gift travels only when its maker has said they pack it
  // heat-safe. The default is `false`, so a chocolate listing nobody has
  // answered for is **not** posted — it is local delivery until somebody
  // makes the claim. Failing toward "don't put it in a van" is the only
  // safe direction: the cost of being wrong the other way is a bag of
  // liquid chocolate arriving as a gift, and a refund a home maker pays.
  if (isEdibleGift(product)) return product.heatSafePacked === true;
  return true;
}

/**
 * The same rule as a Prisma filter, for the queries that select lines
 * rather than test one in hand.
 *
 * A relation filter on `product` is a `null`-excluding inner join, which
 * is the behaviour we want twice over: a legacy hamper line (M18) carries
 * no `Product` row, so it has no kitchen to collect from and cannot be a
 * parcel — booking one would send a rider to nobody.
 */
/** The edible-gifts department, or anything filed under it. */
const EDIBLE_GIFT_SHELF: Prisma.ProductCategoryWhereInput = {
  category: {
    is: {
      OR: [
        { slug: EDIBLE_GIFT_DEPARTMENT_SLUG },
        { parent: { is: { slug: EDIBLE_GIFT_DEPARTMENT_SLUG } } },
      ],
    },
  },
};

export const COURIER_ELIGIBLE_PRODUCT: Prisma.ProductWhereInput = {
  kind: ProductKind.craft,
  OR: [
    // Not an edible gift at all: the ordinary case, and every craft row
    // written before D10.
    { categories: { none: EDIBLE_GIFT_SHELF } },
    // An edible gift whose maker packs it heat-safe.
    { heatSafePacked: true },
  ],
};

export const COURIER_ELIGIBLE_LINE: Prisma.OrderItemWhereInput = {
  product: { is: COURIER_ELIGIBLE_PRODUCT },
};

/**
 * The inverse, and the one that matters most.
 *
 * `reconcileOrderStatus` may only drive `Order.status` when *every* line
 * on the order is one a courier is carrying. A mixed order — a candle and
 * a curry from the same kitchen, in one basket — books a parcel for the
 * candle alone, and a rider delivering it says nothing whatever about the
 * curry. Letting the callback close such an order would stamp
 * `deliveredAt`, start the buyer's seven-day return window and set every
 * kitchen's payout basis (M15/M37) on food that is still in an oven.
 *
 * Written as "NOT eligible" rather than "food", because the honest
 * question is "is there anything here a rider is not carrying" — and that
 * includes the productless hamper line above, which is neither food nor
 * craft and is exactly the row a `kind: food` filter would miss.
 */
export const NON_COURIER_LINE: Prisma.OrderItemWhereInput = {
  OR: [
    // Spelled out rather than written as `NOT: { product: { is: ... } }`.
    // `productId` is nullable, and how a `NOT` over a nullable to-one
    // relation renders is a detail of the query builder rather than a
    // promise — getting it wrong here fails *open*, which is the
    // direction that closes a food order off a courier callback. This
    // form says what it means in SQL either way.
    { productId: null },
    { product: { is: { kind: { not: ProductKind.craft } } } },
    // D10: an edible gift nobody has said is heat-safe is a line no rider
    // is carrying, so an order holding one may not be driven forward by a
    // courier callback — the mixed-basket rule, arriving by a second
    // route now that a craft row can be uncarried.
    { product: { is: { categories: { some: EDIBLE_GIFT_SHELF }, heatSafePacked: false } } },
  ],
};
