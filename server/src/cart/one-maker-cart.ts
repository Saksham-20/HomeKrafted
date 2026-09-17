import { ConflictException } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';

/**
 * One basket holds one maker's things (owner, 2026-09-14).
 *
 * Every marketplace that delivers cooked food works this way, and the
 * reason is that the cook *is* the courier: a HomeKrafter packs and sends
 * their own food, with their own delivery radius, their own prep time and
 * their own working days. A basket spanning two kitchens is two
 * deliveries, two arrival times and two people to chase, presented as one
 * order — and `reconcileOrderStatus` already has to refuse to move such an
 * order forward while any part of it is outstanding (M57).
 *
 * The owner extended it to the gifting half as well, so this is
 * **`vendorId`, whatever the `kind`** — not a food-only rule.
 *
 * The code is what the client acts on. `ConflictException` rather than a
 * 400: nothing about the request is malformed, it conflicts with what is
 * already in the basket, and the way out is a decision the shopper makes
 * (replace the basket, or finish it first) rather than a correction to the
 * payload. The existing maker's name travels with it because "you already
 * have items from another maker" is not actionable — "from Sharma Kitchen"
 * is.
 */
export const CART_OTHER_MAKER = 'CART_OTHER_MAKER';

export interface OtherMakerConflict {
  code: typeof CART_OTHER_MAKER;
  message: string;
  /** The maker whose things are already in the basket. */
  vendorId: string;
  vendorName: string;
}

export function otherMakerConflict(vendorId: string, vendorName: string): OtherMakerConflict {
  return {
    code: CART_OTHER_MAKER,
    /*
     * Read by a client that does not know the code — an older web build,
     * or the native app before it ships a handler — so it has to stand on
     * its own rather than assume a dialog is coming.
     */
    message: `Your basket already has things from ${vendorName}. Finish that order first, or empty your basket to start one with this.`,
    vendorId,
    vendorName,
  };
}

type Db = PrismaClient | Prisma.TransactionClient;

/**
 * Refuse a product from a maker other than the one already in the cart.
 *
 * Shared between `CartService` (checked, locked, before every insert —
 * see the `$transaction` + `SELECT ... FOR UPDATE` on `Cart` around every
 * call site) and `OrdersService.reorder` (checked once per historical
 * line as it's re-added, so a reorder can't silently rebuild a
 * two-vendor basket the way a fresh `POST /cart/items` call never could).
 *
 * Reads the vendor off the products the cart holds rather than caching it
 * on `Cart`: a denormalised column would be one more thing to keep in
 * step on every remove, and the cart is small enough that the join costs
 * nothing. The name comes back with the refusal because the shopper has
 * to be told whose basket they already have.
 *
 * An empty cart accepts anything, which is what makes "empty it and
 * start again" the way out.
 */
export async function assertSameMaker(db: Db, cartId: string, vendorId: string): Promise<void> {
  const held = await db.cartItem.findFirst({
    where: { cartId, product: { vendorId: { not: vendorId } } },
    select: { product: { select: { vendorId: true, vendor: { select: { name: true } } } } },
  });
  if (held?.product) {
    throw new ConflictException(otherMakerConflict(held.product.vendorId, held.product.vendor.name));
  }

  /*
   * A hamper line carries `hamperId` and a NULL `productId`, so the
   * query above cannot see it — leaving "add a hamper, then add
   * anything" as the way round the rule. Its maker is the maker of the
   * products inside it, which `CartService.addHamperItem` forces to be
   * one before this ever runs.
   */
  const heldHamper = await db.cartItem.findFirst({
    where: {
      cartId,
      hamper: { items: { some: { product: { vendorId: { not: vendorId } } } } },
    },
    select: {
      hamper: {
        select: {
          items: {
            where: { product: { vendorId: { not: vendorId } } },
            take: 1,
            select: { product: { select: { vendorId: true, vendor: { select: { name: true } } } } },
          },
        },
      },
    },
  });
  const other = heldHamper?.hamper?.items[0]?.product;
  if (other) {
    throw new ConflictException(otherMakerConflict(other.vendorId, other.vendor.name));
  }
}

/**
 * Defense-in-depth for `OrdersService.create()`.
 *
 * `assertSameMaker` above is checked (and, in `CartService`, locked) on
 * every single insert, so a basket should never be able to reach two
 * makers in the first place. This re-derives the maker set from whatever
 * the cart actually holds at the moment an order is built from it, and
 * refuses rather than silently placing a two-vendor order if it ever
 * disagrees — the same "never trust that an earlier gate held" instinct
 * `resolveCartLines` already applies to price.
 */
export async function assertSingleMakerCart(db: Db, cartId: string): Promise<void> {
  const items = await db.cartItem.findMany({
    where: { cartId },
    select: {
      product: { select: { vendorId: true, vendor: { select: { name: true } } } },
      hamper: {
        select: {
          items: {
            take: 1,
            select: { product: { select: { vendorId: true, vendor: { select: { name: true } } } } },
          },
        },
      },
    },
  });

  let seen: { vendorId: string; vendorName: string } | undefined;
  for (const item of items) {
    const maker = item.product ?? item.hamper?.items[0]?.product;
    if (!maker) continue;
    if (!seen) {
      seen = { vendorId: maker.vendorId, vendorName: maker.vendor.name };
    } else if (maker.vendorId !== seen.vendorId) {
      throw new ConflictException(otherMakerConflict(seen.vendorId, seen.vendorName));
    }
  }
}
