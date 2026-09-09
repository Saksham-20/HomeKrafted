"use client";

import { useState } from "react";
import Link from "next/link";
import { Heart, X } from "lucide-react";
import { ImageSlot } from "@/components/placeholder/ImageSlot";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { useWishlist } from "@/lib/wishlist/WishlistContext";
import { wishlistErrorMessage } from "@/lib/wishlist/wishlist-error";
import { useCart } from "@/lib/cart/CartContext";
import { SOLD_OUT_COPY, addToCartErrorMessage } from "@/lib/cart/add-error";
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
  const { productIds, ready, loadFailed, remove } = useWishlist();
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
    // `null` is the answer "nothing here can be bought", and it used to be
    // thrown away with `?? product.defaultWeightSku` — which posts the
    // sold-out default anyway and 400s with "Only 0 in stock". Sixteen
    // live listings sat at stock 0, so this was not a rare branch. The
    // card renders a sold-out state instead and never reaches here.
    const sku = purchasableSku(product);
    if (!sku) {
      setMoveError(`${product.name}: ${SOLD_OUT_COPY}`);
      return;
    }

    try {
      await addItem(product.id, sku, 1);
    } catch (err) {
      setMoveError(`${product.name}: ${addToCartErrorMessage(err)}`);
      return;
    }

    try {
      // Awaited, now that it can reject: an unwishlist the server refused
      // used to leave the card on screen with no explanation, after the
      // line had already reached the cart.
      await remove(product.id);
    } catch (err) {
      // Its own catch and its own vocabulary. One `try` around both put a
      // refused *unwishlist* into the cart's error copy — "sign in to add
      // things to your cart", said to somebody whose add just worked.
      setMoveError(`${product.name}: ${wishlistErrorMessage(err)}`);
      return;
    }

    setMovedNames((current) => [...current, product.name]);
  }

  if (!ready) {
    return (
      <div className={styles.wrap}>
        <p className={styles.loading}>Loading your wishlist…</p>
      </div>
    );
  }

  /**
   * A failed read is its own state, never the empty one. Before
   * 2026-09-06 a rejected `GET /wishlist` never set `ready`, so this page
   * sat on "Loading your wishlist…" for ever; the fix made the read
   * settle either way, which without this branch would have traded a
   * hang for "0 saved items" over a wishlist that has things in it.
   */
  if (loadFailed) {
    return (
      <div className={styles.wrap}>
        <p className={styles.loading} role="alert">
          We couldn&rsquo;t load your wishlist. That&rsquo;s on us, not your connection — try again
          in a moment.
        </p>
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
                  onClick={() => {
                    setMoveError(null);
                    void remove(product.id).catch((err: unknown) =>
                      setMoveError(`${product.name}: ${wishlistErrorMessage(err)}`),
                    );
                  }}
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
                    {/* A miss in the map used to fall back to
                        "Homekrafted", which is a **real vendor** — vd8,
                        the platform's own storefront (M44) — so a listing
                        whose maker we failed to resolve was attributed to
                        us by name. Say nothing instead: the listing name
                        is the next node and carries the card. */}
                    {vendorNameById[product.vendorId] ?? ""}
                  </span>
                  <Link href={`/product/${product.slug}`} className={styles.name}>
                    {product.name}
                  </Link>
                  {/* `?? 0` printed ₹0 for a listing with no sizes at
                      all — a price nobody set, on a card offering to buy
                      it. No size, no price. */}
                  {weight ? (
                    <span className={styles.price}>{formatCurrency(weight.price)}</span>
                  ) : null}
                  {/* Says sold out up front rather than offering a button
                      that 400s. `purchasableSku` answers `null` for
                      "nothing here can be bought", and this card is the
                      one place on the site that used to ignore that
                      answer — the same rule every product grid follows. */}
                  {purchasableSku(product) === null ? (
                    <span className={styles.soldOut}>Sold out for now</span>
                  ) : (
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
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
