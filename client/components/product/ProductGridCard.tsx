"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ProductCard } from "@/components/ui/ProductCard";
import { useCart } from "@/lib/cart/CartContext";
import { useWishlist } from "@/lib/wishlist/WishlistContext";
import type { Product } from "@/lib/types";

export interface ProductGridCardProps {
  product: Product;
  makerName: string;
  href: string;
  className?: string;
}

/**
 * Thin client wrapper around the `ProductCard` primitive: navigates to the
 * product detail route on card click, adds the card's default weight to
 * the real cart (M3, `useCart().addItem`) on the round "+" button, and
 * (M7a) toggles the real, `localStorage`-persisted wishlist store
 * (`useWishlist()`) on the corner heart. Reused across every product grid
 * built in M2 (Home featured rail, Shop listing, Storefront, Occasion
 * collections) so the click/add/wishlist wiring lives in exactly one place.
 */
export function ProductGridCard({ product, makerName, href, className }: ProductGridCardProps) {
  const router = useRouter();
  const { addItem } = useCart();
  const { has, toggle } = useWishlist();
  const [added, setAdded] = useState(false);

  return (
    <ProductCard
      product={product}
      makerName={makerName}
      className={className}
      onCardClick={() => router.push(href)}
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
