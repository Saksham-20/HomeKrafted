/**
 * Kitchen-diary copy — what the site says while it is thinking (M28).
 *
 * The brand review's objection to "Loading…" was not that it is ugly but
 * that it is *anonymous*: it is the same word a bank or a bug tracker
 * shows, on a site whose whole argument is that a particular person is
 * making a particular thing. These lines are the small, cheap place to
 * sound like the product.
 *
 * **Nothing here is random, and that is a correctness requirement, not a
 * preference.** A `Math.random()` pick during render makes the server and
 * the browser choose different strings, which is React #418 — the exact
 * hydration failure `CLAUDE.md` records from M12, and the reason
 * `lib/occasions.ts` never reads the clock either. `kitchenLoading()`
 * hashes a **stable surface key** instead, so a given screen shows the
 * same line every time on both sides of the wire, while different screens
 * across the app still differ. If you ever want a line to rotate over
 * time, do it in an effect after mount, never during render.
 *
 * Keep the sets honest: a loading message may be warm, but it must not
 * describe something that is not happening. "Passing this to the kitchen"
 * is true at checkout. "Anjali started her tempering at 6:40 AM" would be
 * a fabricated event, and there is no data behind it.
 */

/** General page/route loads. */
export const GENERAL_LOADING = [
  "Washing hands before we begin…",
  "Letting the dough rest…",
  "Warming up the tawa…",
  "Checking today's dabbas…",
] as const;

/** Placing an order — the wait while the order is written down. */
export const CHECKOUT_LOADING = [
  "Passing this to the kitchen, not a warehouse…",
  "No shortcuts — confirming with the maker directly…",
] as const;

/** Wallet: top-ups, balance reads, anything counting money. */
export const WALLET_LOADING = ["Counting it out, like change in a steel dabba…"] as const;

/** The HomeKrafter portal — a maker looking at their own screens. */
export const MAKER_LOADING = [
  "Saving today's batch…",
  "Letting your update reach the shelf…",
] as const;

/**
 * The admin panel gets plain language on purpose.
 *
 * An operator is usually here because something is wrong, and a moderation
 * queue that says "letting the dough rest" while a HomeKrafter waits to be
 * approved is the tone of a product that is not taking the job seriously.
 * Brand voice is for the people being served, not the people working.
 */
export const ADMIN_LOADING = ["Loading…"] as const;

/**
 * Deterministic index from a surface key — a small FNV-1a.
 *
 * Not for security, only for a stable spread: the same key always lands on
 * the same line, so server and client agree, and neighbouring keys do not
 * clump the way `key.length % n` would.
 */
function hashKey(key: string): number {
  let hash = 2166136261;
  for (let i = 0; i < key.length; i += 1) {
    hash ^= key.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/**
 * Pick a line for a surface.
 *
 * `key` should be something stable and descriptive of the screen —
 * `"seller/listings"`, `"account/orders"`. It is the seed, so changing it
 * changes the line; that is fine, it just must not change *between
 * renders of the same screen*.
 */
export function kitchenLoading(
  key: string,
  set: readonly string[] = GENERAL_LOADING,
): string {
  if (set.length === 0) return "Loading…";
  return set[hashKey(key) % set.length];
}

/**
 * Buyer-facing order stages — a kitchen diary, not a logistics tracker.
 *
 * These are **display labels over the existing `OrderStatus` union**; no
 * state was added, renamed or reordered. The states are domain values that
 * the server writes, the seller portal advances and `docs/API.md`
 * documents, and rewording them in the database to sound nicer would be a
 * migration in exchange for nothing.
 *
 * **Every line has to be true of a candle as well as a curry.** This
 * platform sells food *and* craft (M20), and the same pipeline carries
 * both — so "on the stove now", which the brand brief suggested, is wrong
 * for half the catalogue and would read as a bug to anyone who ordered a
 * ceramic mug. "Being made now" says the same thing and survives the
 * difference.
 */
export const ORDER_STAGE_LABEL = {
  placed: "Order received",
  confirmed: "Being made now",
  packed: "Packed with care",
  shipped: "On its way",
  delivered: "Delivered",
} as const;
