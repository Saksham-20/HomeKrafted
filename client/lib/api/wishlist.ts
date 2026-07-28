/** Wishlist (M8.4a — real). Owner-scoped, idempotent adds/removes (`docs/API.md` "Wishlist (owner-scoped)"). Only consumed by `WishlistContext`. */

import type { ID, Wishlist } from "@/lib/types";
import { http } from "./http";

export async function getServerWishlist(): Promise<Wishlist> {
  return http.get<Wishlist>("/wishlist");
}

export async function addWishlistItem(productId: ID): Promise<Wishlist> {
  await http.post("/wishlist/items", { productId });
  return getServerWishlist();
}

export async function removeWishlistItem(productId: ID): Promise<Wishlist> {
  await http.delete(`/wishlist/items/${encodeURIComponent(productId)}`);
  return getServerWishlist();
}
