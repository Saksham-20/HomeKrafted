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

/**
 * Every `/cart` mutation answers with the refreshed cart (`CartService`
 * ends each one in `getCart`), so the response *is* the new state — no
 * second `GET`. A refusal (401 signed-out, 404 delisted/unknown size,
 * 400 over stock) **rejects**; `CartContext` is the one caller and it
 * hands the rejection to the screen that pressed the button.
 */
export async function addCartItem(productId: ID, sku: string, quantity = 1): Promise<ServerCart> {
  return http.post<ServerCart>("/cart/items", { productId, sku, quantity });
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
  return http.post<ServerCart>("/cart/hamper-items", input);
}

export async function updateCartItemQty(itemId: ID, quantity: number): Promise<ServerCart> {
  return http.patch<ServerCart>(`/cart/items/${encodeURIComponent(itemId)}`, { quantity });
}

export async function removeCartItem(itemId: ID): Promise<ServerCart> {
  return http.delete<ServerCart>(`/cart/items/${encodeURIComponent(itemId)}`);
}

export async function assignCartItemAddress(itemId: ID, addressId: ID | undefined): Promise<ServerCart> {
  return http.post<ServerCart>(`/cart/items/${encodeURIComponent(itemId)}/address`, { addressId });
}

export async function clearServerCart(): Promise<void> {
  await http.delete<void>("/cart");
}
