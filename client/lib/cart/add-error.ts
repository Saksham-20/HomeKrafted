/**
 * What to tell somebody whose add-to-cart the server refused.
 *
 * `POST /cart/items` refuses in three ways, and until 2026-09-03 the
 * client showed none of them: `CartContext.addItem` was
 * `void addCartItem(...).then(...)` with no `catch`, so every refusal
 * vanished and the button flipped to "Added ✓" over a cart that had not
 * changed. Sixteen live listings had `stock: 0` on their only size
 * (`ListingForm` turned a blank stock field into 0), so for those the
 * button lied on every press. This maps each refusal to a sentence a
 * buyer can act on; the server's own wording names a SKU
 * ("Only 0 in stock for rakhi-hamper-400g"), which is a database key,
 * not copy.
 *
 * `cartUpdateErrorMessage` is the same idea for the other three
 * mutations. They were `void promise.then(...)` with no `catch` until
 * 2026-09-06 — so a quantity the server refused still went up on screen,
 * a removed line stayed removed locally, and a checkout address silently
 * failed to attach. Separate copy because "sign in to add things to your
 * cart" is the wrong sentence when somebody is removing one.
 *
 * Pure, so the mapping is unit-tested (`add-error.spec.ts`).
 */

const STOCK_RE = /only\s+(\d+)\s+in stock/i;

export const SOLD_OUT_COPY = "Sold out for now — the maker hasn't listed more yet.";

export function addToCartErrorMessage(err: unknown): string {
  const status =
    typeof err === "object" && err !== null && "status" in err
      ? Number((err as { status?: unknown }).status)
      : undefined;
  const message = err instanceof Error ? err.message : "";

  if (status === 401) return "Sign in to add things to your cart.";
  if (status === 404) return "This listing isn't available any more.";

  const stock = STOCK_RE.exec(message);
  if (stock) {
    const n = Number(stock[1]);
    if (n <= 0) return SOLD_OUT_COPY;
    return `Only ${n} of this size can be ordered right now, counting what's already in your cart.`;
  }

  if (status === 0) return message || "We couldn't reach the server. Please try again.";
  return message || "That didn't go into your cart. Please try again.";
}

export function cartUpdateErrorMessage(err: unknown): string {
  const status =
    typeof err === "object" && err !== null && "status" in err
      ? Number((err as { status?: unknown }).status)
      : undefined;
  const message = err instanceof Error ? err.message : "";

  if (status === 401) return "Sign in again to change your cart.";
  if (status === 404) return "That item is no longer in your cart.";

  const stock = STOCK_RE.exec(message);
  if (stock) {
    const n = Number(stock[1]);
    if (n <= 0) return SOLD_OUT_COPY;
    return `Only ${n} of this size can be ordered right now.`;
  }

  if (status === 0) return message || "We couldn't reach the server. Please try again.";
  return message || "We couldn't update your cart. Please try again.";
}
