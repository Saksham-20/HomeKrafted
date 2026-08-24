/**
 * What a buyer asked for in the product page's "Make it a gift" block,
 * carried across to checkout.
 *
 * **Why this exists.** The block shipped as three `<span>`s. They looked
 * like controls, they were captioned "Add a handwritten message card and
 * gift wrap at checkout", and pressing them did nothing — checkout had a
 * gift toggle and a message field the buyer had to find again on their
 * own, and **gift wrap existed on no screen at all** (`CartItem.giftWrap`
 * and `OrderItem.giftWrap` were written by nothing). So the page made
 * three promises, of which one and a half were reachable.
 *
 * The gift block now sets this, and `CheckoutClient` reads it on mount:
 * the gift section opens already ticked, the message the buyer typed on
 * the product page is already in the box, and gift wrap is a real
 * checkbox that reaches `OrderItem.giftWrap`.
 *
 * **`sessionStorage`, not the cart.** Wrap is a per-line column server
 * side, but no endpoint writes it — adding one is a cart-API change, and
 * the honest scope of this fix is "the buttons work". This is a hint the
 * next screen picks up, so it is per-tab, expendable, and its absence is
 * simply "no gift asked for". Every access is wrapped: a private window
 * or blocked site data must leave the page working, never throw.
 *
 * It is **cleared once checkout has consumed it** (`clearGiftIntent`), so
 * a gift bought on Tuesday does not pre-tick the gift box on Thursday's
 * order for oneself.
 */
export interface GiftIntent {
  /** "🎀 Gift wrap" — every line in the order is wrapped. */
  wrap: boolean;
  /** "✎ Message card" — a handwritten card goes in the parcel. */
  messageCard: boolean;
  /** "📮 Ship to recipient" — pre-ticks checkout's "this is a gift". */
  shipToRecipient: boolean;
  /** What the card should say. Empty unless `messageCard` is on. */
  message: string;
}

const KEY = "hk_gift_intent";

export const EMPTY_GIFT_INTENT: GiftIntent = {
  wrap: false,
  messageCard: false,
  shipToRecipient: false,
  message: "",
};

/** True when the buyer asked for anything at all — the only reason checkout should act. */
export function hasGiftIntent(intent: GiftIntent): boolean {
  return intent.wrap || intent.messageCard || intent.shipToRecipient;
}

export function readGiftIntent(): GiftIntent {
  if (typeof window === "undefined") return EMPTY_GIFT_INTENT;
  try {
    const raw = window.sessionStorage.getItem(KEY);
    if (!raw) return EMPTY_GIFT_INTENT;
    const parsed = JSON.parse(raw) as Partial<GiftIntent>;
    return {
      wrap: Boolean(parsed.wrap),
      messageCard: Boolean(parsed.messageCard),
      shipToRecipient: Boolean(parsed.shipToRecipient),
      message: typeof parsed.message === "string" ? parsed.message : "",
    };
  } catch {
    return EMPTY_GIFT_INTENT;
  }
}

export function writeGiftIntent(intent: GiftIntent): void {
  if (typeof window === "undefined") return;
  try {
    if (!hasGiftIntent(intent) && !intent.message) {
      window.sessionStorage.removeItem(KEY);
      return;
    }
    window.sessionStorage.setItem(KEY, JSON.stringify(intent));
  } catch {
    // Blocked site data. The gift block still works on this page; the
    // hand-off to checkout is what is lost, and checkout still asks.
  }
}

export function clearGiftIntent(): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(KEY);
  } catch {
    // Nothing to do — see `writeGiftIntent`.
  }
}
