"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ShoppingBag } from "lucide-react";
import { useCart } from "@/lib/cart/CartContext";
import { formatCurrency } from "@/lib/format";
import styles from "./CartBar.module.css";

/**
 * The cart, wherever you are (2026-09-03). A non-empty cart used to be
 * reachable only through the header icon — which on the landing page is
 * not rendered at all, and on a phone is a 21px glyph in the top corner
 * of the page somebody has scrolled away from. Swiggy and Zomato keep a
 * "N items · View cart" strip docked to the bottom while anything is in
 * the basket; this is that strip.
 *
 * - Renders nothing until the cart has loaded and holds something, so
 *   the server and the first client paint agree (both empty).
 * - Hidden on `/cart` and `/checkout`, which *are* the cart.
 * - Rendered from `ConsumerChrome`, so the role surfaces never get it;
 *   a seller/admin session reads an empty cart anyway (`CartContext`).
 * - Docks above a product page's own sticky Add-to-cart bar via the
 *   `--hk-dock-h` custom property that bar publishes while it is showing
 *   (`ProductPurchasePanel`), instead of covering it.
 * - Under 640px it is a full-width bar and reserves its own height in
 *   flow (`.spacer`) so the footer's last row stays reachable; above it
 *   is a floating pill in the corner and reserves nothing.
 * - One link, whole surface. Pine fill, so the focus ring is the gold
 *   one (M34).
 */
export function CartBar() {
  const { count, subtotal, ready } = useCart();
  const pathname = usePathname();

  if (!ready || count === 0) return null;
  if (pathname === "/cart" || pathname.startsWith("/checkout")) return null;

  const itemsLabel = `${count} item${count === 1 ? "" : "s"}`;

  return (
    <>
      <div className={styles.spacer} aria-hidden="true" />
      <Link
        href="/cart"
        className={styles.bar}
        aria-label={`View cart: ${itemsLabel}, ${formatCurrency(subtotal)}`}
      >
        <span className={styles.left}>
          <span className={styles.iconWrap} aria-hidden="true">
            <ShoppingBag size={18} strokeWidth={1.7} />
            <span className={styles.count}>{count}</span>
          </span>
          <span className={styles.meta}>
            <span className={styles.items}>{itemsLabel}</span>
            <span className={styles.total}>{formatCurrency(subtotal)}</span>
          </span>
        </span>
        <span className={styles.cta}>View cart →</span>
      </Link>
    </>
  );
}
