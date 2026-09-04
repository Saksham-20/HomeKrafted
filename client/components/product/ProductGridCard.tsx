"use client";

import { useState } from "react";
import { ProductCard } from "@/components/ui/ProductCard";
import { useCart } from "@/lib/cart/CartContext";
import { addToCartErrorMessage } from "@/lib/cart/add-error";
import { purchasableSku } from "@/lib/cart/purchasable-sku";
import { useWishlist } from "@/lib/wishlist/WishlistContext";
import type { Product } from "@/lib/types";

export interface ProductGridCardProps {
  product: Product;
  makerName: string;
  href: string;
  /** Forwarded to `ProductCard` — first card of an above-the-fold grid only. */
  priority?: boolean;
  className?: string;
}

/**
 * Thin client wrapper around the `ProductCard` primitive: passes the
 * product detail route as a real link, adds the card's default weight to
 * the real cart (M3, `useCart().addItem`) on the round "+" button, and
 * (M7a) toggles the real, `localStorage`-persisted wishlist store
 * (`useWishlist()`) on the corner heart. Reused across every product grid
 * built in M2 (Home featured rail, Shop listing, Storefront, Occasion
 * collections) so the click/add/wishlist wiring lives in exactly one place.
 *
 * "Added" is set **after** the server answers, and a refusal is shown on
 * the card (2026-09-03). The "+" adds the default size when it is in
 * stock and the first size that is otherwise; a listing with no size in
 * stock renders "Sold out" instead of a button.
 */
export function ProductGridCard({ product, makerName, href, priority, className }: ProductGridCardProps) {
  const { addItem } = useCart();
  const { has, toggle } = useWishlist();
  const [added, setAdded] = useState(false);
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const sku = purchasableSku(product);

  async function handleAdd() {
    if (!sku || adding) return;
    setAdding(true);
    setAddError(null);
    try {
      await addItem(product.id, sku, 1);
      setAdded(true);
    } catch (err) {
      setAdded(false);
      setAddError(addToCartErrorMessage(err));
    } finally {
      setAdding(false);
    }
  }

  return (
    <ProductCard
      product={product}
      makerName={makerName}
      priority={priority}
      className={className}
      // `href`, not `router.push` (M22). The card is now a real link, so
      // it can be opened in a new tab and — the actual defect — activated
      // from the keyboard, which a `role="button"` div never could.
      href={href}
      wishlisted={has(product.id)}
      onToggleWishlist={() => toggle(product.id)}
      added={added}
      soldOut={sku === null}
      addError={addError}
      onAdd={handleAdd}
    />
  );
}
