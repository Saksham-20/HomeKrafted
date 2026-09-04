"use client";

import { useState } from "react";
import Link from "next/link";
import { Heart, X } from "lucide-react";
import { ImageSlot } from "@/components/placeholder/ImageSlot";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { useWishlist } from "@/lib/wishlist/WishlistContext";
import { useCart } from "@/lib/cart/CartContext";
import { addToCartErrorMessage } from "@/lib/cart/add-error";
import { purchasableSku } from "@/lib/cart/purchasable-sku";
import { formatCurrency } from "@/lib/format";
import type { Product } from "@/lib/types";
import styles from "./WishlistPageClient.module.css";

export interface WishlistPageClientProps {
  products: Product[];
  vendorNameById: Record<string, string>;
}

/**
 * Wishlist grid (M7a) — reads `useWishlist().productIds` and filters the
 * server-fetched catalog down to just those products. "Remove" (×)
 * unwishlists in place; "Move to cart" adds the default weight to the
 * real cart (`useCart().addItem`, same as `ProductGridCard`) and removes
 * it from the wishlist in one action.
 */
export function WishlistPageClient({ products, vendorNameById }: WishlistPageClientProps) {
  const { productIds, ready, remove } = useWishlist();
  const { addItem } = useCart();
  const [movedNames, setMovedNames] = useState<string[]>([]);
  const [moveError, setMoveError] = useState<string | null>(null);

  const items = products.filter((product) => productIds.includes(product.id));

  // Removed from the wishlist only once the cart has it. Before
  // 2026-09-03 this removed first and never heard the refusal, so a
  // sold-out listing vanished from the wishlist *and* never reached the
  // cart — the one outcome worse than either alone.
  async function handleMoveToCart(product: Product) {
    setMoveError(null);
    const sku = purchasableSku(product) ?? product.defaultWeightSku;
    try {
      await addItem(product.id, sku, 1);
      remove(product.id);
      setMovedNames((current) => [...current, product.name]);
    } catch (err) {
      setMoveError(`${product.name}: ${addToCartErrorMessage(err)}`);
    }
  }

  if (!ready) {
    return (
      <div className={styles.wrap}>
        <p className={styles.loading}>Loading your wishlist…</p>
      </div>
    );
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.header}>
        <span className={styles.eyebrow}>Account</span>
        <h1 className={styles.title}>Wishlist</h1>
        <p className={styles.subtitle}>
          {items.length} saved item{items.length === 1 ? "" : "s"}
        </p>
      </div>

      {moveError && (
        <p className={styles.toastError} role="alert">
          {moveError}
        </p>
      )}
      {movedNames.length > 0 && !moveError && (
        <p className={styles.toast} role="status">
          Moved {movedNames[movedNames.length - 1]} to your cart.{" "}
          <Link href="/cart" className={styles.toastLink}>
            View cart →
          </Link>
        </p>
      )}

      {items.length === 0 ? (
        <Card className={styles.empty}>
          <Heart size={22} strokeWidth={1.6} className={styles.emptyIcon} />
          <p className={styles.emptyTitle}>Your wishlist is empty</p>
          <p className={styles.emptyCopy}>Tap the heart on any product to save it here.</p>
          <Link href="/shop" className={styles.shopLink}>
            Browse the shop →
          </Link>
        </Card>
      ) : (
        <div className={styles.grid}>
          {items.map((product) => {
            const weight =
              product.weightOptions.find((w) => w.sku === product.defaultWeightSku) ??
              product.weightOptions[0];
            const image = product.images[0];
            return (
              <Card key={product.id} padding="none" className={styles.item}>
                <button
                  type="button"
                  className={styles.removeButton}
                  onClick={() => remove(product.id)}
                  aria-label={`Remove ${product.name} from wishlist`}
                >
                  <X size={14} strokeWidth={1.8} />
                </button>
                <Link href={`/product/${product.slug}`} className={styles.imageLink}>
                  <ImageSlot
                    ratio={image?.ratio ?? "1/1"}
                    label={image?.placeholder ?? product.name}
                    src={image?.src}
                    alt={product.name}
                    sizes="88px"
                    compact
                  />
                </Link>
                <div className={styles.body}>
                  <span className={styles.maker}>
                    {vendorNameById[product.vendorId] ?? "Homekrafted"}
                  </span>
                  <Link href={`/product/${product.slug}`} className={styles.name}>
                    {product.name}
                  </Link>
                  <span className={styles.price}>{formatCurrency(weight?.price ?? 0)}</span>
                  <Button
                    variant="primary"
                    size="sm"
                    className={styles.moveButton}
                    // Every card's button reads "Move to cart", so a screen
                    // reader walking the grid hears the same three words
                    // repeated with nothing to tell them apart. The visible
                    // label stays short; the accessible one names the item,
                    // same fix as `QuantityStepper`'s `itemName`.
                    aria-label={`Move ${product.name} to cart`}
                    onClick={() => handleMoveToCart(product)}
                  >
                    Move to cart
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
