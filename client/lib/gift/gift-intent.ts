/**
 * The `sessionStorage` half of the gift hand-off. **Web only.**
 *
 * The shape, the rules and the parse live in `gift-intent-shape.ts` and
 * are shared with the native app; this is the store, and it is the reason
 * the two are separate files. Every access here touches a DOM global, and
 * on Hermes `window` exists while `sessionStorage` does not — so the
 * `catch` below, which is correct on the web (a private window or blocked
 * site data must leave the page working), would silently swallow every
 * gift a buyer asked for on a phone. The app refuses this module in Metro
 * and at import under jest, and imports the shape instead.
 *
 * **Why this exists.** The product page's "Make it a gift" block shipped
 * as three `<span>`s. They looked like controls, they were captioned "Add
 * a handwritten message card and gift wrap at checkout", and pressing
 * them did nothing — checkout had a gift toggle and a message field the
 * buyer had to find again on their own, and **gift wrap existed on no
 * screen at all** (`CartItem.giftWrap` and `OrderItem.giftWrap` were
 * written by nothing). So the page made three promises, of which one and
 * a half were reachable.
 *
 * The block now sets this, and `CheckoutClient` reads it on mount: the
 * gift section opens already ticked, the message the buyer typed on the
 * product page is already in the box, and gift wrap is a real checkbox
 * that reaches `OrderItem.giftWrap`.
 *
 * **`sessionStorage`, not the cart.** Wrap is a per-line column server
 * side, but no endpoint writes it — adding one is a cart-API change, and
 * the honest scope of this fix is "the buttons work". This is a hint the
 * next screen picks up, so it is per-tab, expendable, and its absence is
 * simply "no gift asked for".
 *
 * It is **cleared once checkout has consumed it** (`clearGiftIntent`), so
 * a gift bought on Tuesday does not pre-tick the gift box on Thursday's
 * order for oneself.
 */
import {
  EMPTY_GIFT_INTENT,
  GIFT_INTENT_KEY,
  isWorthStoring,
  parseGiftIntent,
  type GiftIntent,
} from "./gift-intent-shape";

export {
  EMPTY_GIFT_INTENT,
  hasGiftIntent,
  parseGiftIntent,
  type GiftIntent,
} from "./gift-intent-shape";

export function readGiftIntent(): GiftIntent {
  if (typeof window === "undefined") return EMPTY_GIFT_INTENT;
  try {
    const raw = window.sessionStorage.getItem(GIFT_INTENT_KEY);
    if (!raw) return EMPTY_GIFT_INTENT;
    return parseGiftIntent(raw);
  } catch {
    return EMPTY_GIFT_INTENT;
  }
}

export function writeGiftIntent(intent: GiftIntent): void {
  if (typeof window === "undefined") return;
  try {
    if (!isWorthStoring(intent)) {
      window.sessionStorage.removeItem(GIFT_INTENT_KEY);
      return;
    }
    window.sessionStorage.setItem(GIFT_INTENT_KEY, JSON.stringify(intent));
  } catch {
    // Blocked site data. The gift block still works on this page; the
    // hand-off to checkout is what is lost, and checkout still asks.
  }
}

export function clearGiftIntent(): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(GIFT_INTENT_KEY);
  } catch {
    // Nothing to do — see `writeGiftIntent`.
  }
}
