/**
 * Cart (M8.4a — real). Owner-scoped, 1:1 per user (`docs/API.md` "Cart
 * (owner-scoped)"). `GET /cart` returns the richer `ServerCart`/
 * `ServerCartLine` shape (`lib/types/marketplace.ts`) — every line already
 * carries its resolved `name`/`unitPrice`/`lineTotal`/etc., so
 * `CartContext` reads those directly instead of computing them from a
 * separately-fetched catalog (the M8.4 "recommended" option in
 * `docs/API.md`'s response-shape notes). Only consumed by `CartContext` —
 * no other call site talks to `/cart` directly.
 */

import type { Hamper, ID, ServerCart } from "@/lib/types";
import { http } from "./http";

export async function getServerCart(): Promise<ServerCart> {
  return http.get<ServerCart>("/cart");
}

export async function addCartItem(productId: ID, sku: string, quantity = 1): Promise<ServerCart> {
  await http.post("/cart/items", { productId, sku, quantity });
  return getServerCart();
}

export interface AddHamperCartItemInput {
  boxId: ID;
  items: { productId: ID; quantity: number }[];
  giftNote?: string;
  wrap?: Hamper["wrap"];
  ribbon?: Hamper["ribbon"];
  nameCard?: string;
  recipientAddressId?: ID;
  hidePrice?: boolean;
}

/** `POST /cart/hamper-items` — creates a real `Hamper` row + one `CartItem` line. Returns the refreshed cart so the caller can resolve the new line's id (the newest hamper-shaped item). */
export async function addHamperCartItem(input: AddHamperCartItemInput): Promise<ServerCart> {
  await http.post("/cart/hamper-items", input);
  return getServerCart();
}

export async function updateCartItemQty(itemId: ID, quantity: number): Promise<ServerCart> {
  await http.patch(`/cart/items/${encodeURIComponent(itemId)}`, { quantity });
  return getServerCart();
}

export async function removeCartItem(itemId: ID): Promise<ServerCart> {
  await http.delete(`/cart/items/${encodeURIComponent(itemId)}`);
  return getServerCart();
}

export async function assignCartItemAddress(itemId: ID, addressId: ID | undefined): Promise<ServerCart> {
  await http.post(`/cart/items/${encodeURIComponent(itemId)}/address`, { addressId });
  return getServerCart();
}

export async function clearServerCart(): Promise<void> {
  await http.delete<void>("/cart");
}
