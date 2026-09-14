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
