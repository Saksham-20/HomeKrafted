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
 * If this ever needs narrowing to long deliveries only, the change is
 * `&& product.shippingScope === national` **here**, and nowhere else —
 * which is the whole reason this is a function and not four inlined
 * `kind === 'craft'` checks.
 */
export function isCourierEligible(product: { kind: ProductKind } | null | undefined): boolean {
  return product?.kind === ProductKind.craft;
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
export const COURIER_ELIGIBLE_PRODUCT: Prisma.ProductWhereInput = { kind: ProductKind.craft };

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
  ],
};
