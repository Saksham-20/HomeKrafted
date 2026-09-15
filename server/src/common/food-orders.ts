import { ConflictException } from '@nestjs/common';

/**
 * Homemade food is "coming soon" (2026-09-15, owner): the food side stays
 * browsable, but nothing on it can be bought while
 * `PlatformSettings.foodOrdersOpen` is off — the business is launching on
 * gifting first.
 *
 * Enforced here rather than only by hiding buttons, because the API is
 * also the native app's and anybody's with a token. Every path that can
 * put food into somebody's hands checks it: adding to a cart, reordering,
 * placing an order from a basket filled before the switch, and subscribing
 * to a meal plan.
 *
 * A 409 with a code, the `CART_OTHER_MAKER` shape: a screen branches on
 * the code, and a client that does not know it still has a sentence to show.
 */
export const FOOD_COMING_SOON = 'FOOD_COMING_SOON';

export const FOOD_COMING_SOON_MESSAGE =
  "Homemade food is coming soon. You're welcome to browse our kitchens, but food orders aren't open yet — for now we're focused on handcrafted gifts.";

export function foodComingSoon(): ConflictException {
  return new ConflictException({ code: FOOD_COMING_SOON, message: FOOD_COMING_SOON_MESSAGE });
}
