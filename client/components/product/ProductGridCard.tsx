"use client";

import { useState } from "react";
import { ProductCard } from "@/components/ui/ProductCard";
import { useCart } from "@/lib/cart/CartContext";
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
 */
export function ProductGridCard({ product, makerName, href, priority, className }: ProductGridCardProps) {
  const { addItem } = useCart();
  const { has, toggle } = useWishlist();
  const [added, setAdded] = useState(false);

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
      onAdd={() => {
        addItem(product.id, product.defaultWeightSku, 1);
        setAdded(true);
      }}
    />
  );
}
