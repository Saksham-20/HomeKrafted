/**
 * What a buyer asked for in the product page's "Make it a gift" block —
 * the **shape and the rules**, with no storage in them.
 *
 * Split out of `gift-intent.ts` on 2026-09-06, and the reason is worth
 * writing down. That module reads `window.sessionStorage` and catches its
 * own `TypeError`. On the web that catch is right: a private window or
 * blocked site data must leave the page working. On Hermes it is a trap —
 * `window` exists and `sessionStorage` does not, so every read answers
 * empty and every write vanishes, in silence, from a module whose
 * comments promise the opposite. It resolves, compiles and typechecks and
 * is wrong only on a device, which is why the native app **refuses** it
 * (a throw in Metro and at import under jest) rather than aliasing it.
 *
 * A refusal is only honest if the half that is fine to share is actually
 * reachable, and this is that half: the type, the empty value, "did the
 * buyer ask for anything", and the parse. Both packages use these; each
 * supplies its own store — `sessionStorage` on the web, memory on the
 * phone, where a per-launch hand-off is the same expendable hint a
 * per-tab one is. Neither belongs on disk: a gift message is somebody's
 * words to somebody else.
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

/** The storage key, shared so a store cannot invent its own and lose the hand-off. */
export const GIFT_INTENT_KEY = "hk_gift_intent";

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

/**
 * Anything at all → a `GiftIntent`.
 *
 * Total on purpose: this parses a string somebody could have edited by
 * hand, so every field is coerced and a malformed one reads as "not
 * asked" rather than throwing on the screen where the buyer is paying.
 */
export function parseGiftIntent(raw: unknown): GiftIntent {
  if (typeof raw === "string") {
    try {
      return parseGiftIntent(JSON.parse(raw));
    } catch {
      return EMPTY_GIFT_INTENT;
    }
  }
  if (!raw || typeof raw !== "object") return EMPTY_GIFT_INTENT;
  const parsed = raw as Partial<GiftIntent>;
  return {
    wrap: Boolean(parsed.wrap),
    messageCard: Boolean(parsed.messageCard),
    shipToRecipient: Boolean(parsed.shipToRecipient),
    message: typeof parsed.message === "string" ? parsed.message : "",
  };
}

/**
 * Whether this intent is worth keeping at all.
 *
 * A message with no other flag still counts: somebody typed it. What is
 * *not* worth keeping is the empty value, and a store that writes it
 * leaves a stale key behind for the next order to pick up.
 */
export function isWorthStoring(intent: GiftIntent): boolean {
  return hasGiftIntent(intent) || Boolean(intent.message);
}
