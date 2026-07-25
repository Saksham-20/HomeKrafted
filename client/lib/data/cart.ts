import type { Cart } from "@/lib/types";

/**
 * Minimal seed cart — just enough for the header's cart count badge to
 * show something real in M0. The full cart page/logic is M3.
 */
export const mockCart: Cart = {
  id: "cart-demo",
  userId: "user-demo",
  items: [
    { id: "ci1", productId: "pr1", sku: "mango-thokku-pickle-250g", quantity: 1 },
    { id: "ci2", productId: "pr6", sku: "dry-fruit-laddoo-box-400g", quantity: 1 },
  ],
  updatedAt: "2026-07-23T09:00:00+05:30",
};

export function getCartItemCount(cart: Cart): number {
  return cart.items.reduce((sum, item) => sum + item.quantity, 0);
}
