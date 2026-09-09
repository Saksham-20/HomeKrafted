/**
 * What to tell somebody whose wishlist change the server refused.
 *
 * The fourth instance of one defect. `CartContext.addItem` was
 * `void addCartItem(...).then(...)` with no `catch` until 2026-09-03; the
 * other three cart mutations were the same until 2026-09-06; and
 * `WishlistContext.toggle`/`remove` still are. The heart is worse than
 * the cart's button in one way and better in another: it flips only when
 * the response arrives, so it never lies — but a refused press does
 * **nothing at all** and says nothing, which reads as a broken control.
 *
 * Pure, so the mapping is unit-tested and so the native app shares it.
 */

export function wishlistErrorMessage(err: unknown): string {
  const status =
    typeof err === "object" && err !== null && "status" in err
      ? Number((err as { status?: unknown }).status)
      : undefined;
  const message = err instanceof Error ? err.message : "";

  // Saving something is a write, and auth is asked for at the point of a
  // write — so this is the commonest refusal there is, not an edge case.
  if (status === 401) return "Sign in to save things you like.";
  if (status === 404) return "This listing isn't available any more.";
  if (status === 0) return message || "We couldn't reach the server. Please try again.";
  return message || "We couldn't save that. Please try again.";
}
