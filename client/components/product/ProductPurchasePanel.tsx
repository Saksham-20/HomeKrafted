"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { Heart } from "lucide-react";
import { Chip } from "@/components/ui/Chip";
import { QuantityStepper } from "@/components/ui/QuantityStepper";
import { Button } from "@/components/ui/Button";
import { formatCurrency } from "@/lib/format";
import { CASHBACK_RATE } from "@/lib/cart/pricing";
import { useCart } from "@/lib/cart/CartContext";
import { useWishlist } from "@/lib/wishlist/WishlistContext";
import type { Product } from "@/lib/types";
import styles from "./ProductPurchasePanel.module.css";

export interface ProductPurchasePanelProps {
  product: Product;
}

/**
 * Product detail's purchase controls: weight-option chips, quantity
 * stepper, add-to-cart and wishlist toggle.
 * Add-to-cart wires into the real cart store (M3, `useCart().addItem`);
 * the wishlist heart wires into the real wishlist store (M7a,
 * `useWishlist()`). Weight selection state lives here so the cart wiring
 * has a single, obvious hook-in point (`selectedSku` + `quantity`).
 */
export function ProductPurchasePanel({ product }: ProductPurchasePanelProps) {
  const router = useRouter();
  const { addItem } = useCart();
  const { has, toggle } = useWishlist();
  const wishlisted = has(product.id);
  const [selectedSku, setSelectedSku] = useState(product.defaultWeightSku);
  const [quantity, setQuantity] = useState(1);
  const [added, setAdded] = useState(false);

  // The mobile sticky bar (M37): on a phone the in-flow Add to cart
  // scrolls away under the description, and the one action the page
  // exists for stops being reachable. The bar shows only while the real
  // button is off-screen — an IntersectionObserver on the buy row, not a
  // scroll listener — and only below the 640 rail (the CSS hides it
  // above; the observer runs harmlessly). Appearance is a CSS
  // transition, so the global reduced-motion floor already covers it.
  const buyRowRef = useRef<HTMLDivElement | null>(null);
  const [buyRowVisible, setBuyRowVisible] = useState(true);

  useEffect(() => {
    const el = buyRowRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      ([entry]) => setBuyRowVisible(entry.isIntersecting),
      { threshold: 0 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  function handleAdd() {
    addItem(product.id, selectedSku, quantity);
    setAdded(true);
  }

  const weight =
    product.weightOptions.find((w) => w.sku === selectedSku) ?? product.weightOptions[0];
  /**
   * M46 — three prices, two shown. `salePrice` is what the maker's
   * storefront sale brings it to and is what the checkout actually
   * charges (`resolveCartLine`); `price` is what it is struck through
   * against. `mrp` — the per-product offer — is dropped while a
   * storefront sale runs, because two crossed-out numbers beside one real
   * one reads as a trick.
   */
  const payable = weight ? (weight.salePrice ?? weight.price) : 0;
  const struckPrice = weight?.salePrice !== undefined ? weight.price : weight?.mrp;
  const showStruck = Boolean(weight && struckPrice !== undefined && struckPrice > payable);
  const discountPct =
    product.discountPct ??
    (weight && weight.mrp > weight.price
      ? Math.round(((weight.mrp - weight.price) / weight.mrp) * 100)
      : 0);

  /**
   * **The cashback shown here used to be a promise nothing kept.** It was
   * `weight.price × product.cashbackPct`, a per-listing percentage the
   * HomeKrafter typed into the listing form — and the checkout has always
   * credited a flat platform rate on the whole subtotal
   * (`server/src/common/pricing/pricing.util.ts#CASHBACK_RATE`, mirrored
   * in `lib/cart/pricing.ts`). A listing set to 20% therefore advertised
   * four times the cashback the buyer received, on the screen where they
   * decide to buy.
   *
   * `cashbackPct` still exists on the column and still round-trips
   * through the seller form's payload, so no data changes. It just stops
   * being quoted as money. A HomeKrafter who wants to give buyers
   * something has a real lever now — their own storefront sale (M46).
   */
  const cashback = Math.round(payable * CASHBACK_RATE);

  return (
    <div className={styles.panel}>
      {weight && (
        <div className={styles.priceRow}>
          <span className={styles.price}>{formatCurrency(payable)}</span>
          {showStruck && struckPrice !== undefined && (
            <>
              <span className={styles.mrp}>{formatCurrency(struckPrice)}</span>
              <span className={styles.discount}>{discountPct}% off</span>
            </>
          )}
        </div>
      )}

      <div className={styles.weightLabel}>Weight</div>
      <div className={styles.weightRow}>
        {product.weightOptions.map((option) => (
          <Chip
            key={option.sku}
            label={option.label}
            selected={option.sku === selectedSku}
            onClick={() => {
              setSelectedSku(option.sku);
              setAdded(false);
            }}
          />
        ))}
      </div>

      <div className={styles.cashback}>
        Earn {formatCurrency(cashback)} wallet cashback on this order
      </div>

      <div className={styles.buyRow} ref={buyRowRef}>
        <QuantityStepper value={quantity} onChange={setQuantity} aria-label="Quantity" />
        <Button variant="primary" className={styles.addToCart} onClick={handleAdd}>
          {added ? "Added ✓" : "Add to cart"}
        </Button>
        <button
          type="button"
          className={clsx(styles.wishlist, wishlisted && styles.wishlisted)}
          onClick={() => toggle(product.id)}
          aria-label={wishlisted ? "Remove from wishlist" : "Add to wishlist"}
          aria-pressed={wishlisted}
        >
          <Heart size={20} strokeWidth={1.6} fill={wishlisted ? "currentColor" : "none"} />
        </button>
      </div>
      {added && (
        <p className={styles.toast}>
          Added to cart —{" "}
          <button type="button" className={styles.toastLink} onClick={() => router.push("/cart")}>
            view cart
          </button>
        </p>
      )}

      {/* No "add to a gift hamper" (M18): a hamper is a listing its
          HomeKrafter assembles and prices, not a basket a buyer fills, so
          there is nothing on this page to add anything to. */}

      <div className={styles.giftBlock}>
        <div className={styles.giftLabel}>Make it a gift</div>
        <p className={styles.giftCopy}>
          Add a handwritten message card and gift wrap at checkout, or send it straight to a
          recipient&rsquo;s address.
        </p>
        <div className={styles.giftChips}>
          <span className={styles.giftChip}>✎ Message card</span>
          <span className={styles.giftChip}>🎀 Gift wrap</span>
          <span className={styles.giftChip}>📮 Ship to recipient</span>
        </div>
      </div>

      {/* Phone-only (≤640 rail, CSS-gated); `aria-hidden` while the real
          controls are on screen so nothing is announced twice. */}
      <div
        className={clsx(styles.stickyBar, !buyRowVisible && styles.stickyBarVisible)}
        aria-hidden={buyRowVisible}
      >
        <div className={styles.stickyInfo}>
          <span className={styles.stickyName}>{product.name}</span>
          {weight && <span className={styles.stickyPrice}>{formatCurrency(weight.price)}</span>}
        </div>
        <Button
          variant="primary"
          size="sm"
          onClick={handleAdd}
          tabIndex={buyRowVisible ? -1 : 0}
        >
          {added ? "Added ✓" : "Add to cart"}
        </Button>
      </div>
    </div>
  );
}
