"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { ShoppingBag } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { StickySummary } from "@/components/ui/StickySummary";
import { CartLineRow } from "@/components/cart/CartLineRow";
import { useCart } from "@/lib/cart/CartContext";
import { computeCashback, computeShipping, FREE_SHIPPING_THRESHOLD } from "@/lib/cart/pricing";
import { formatCurrency } from "@/lib/format";
import styles from "./Cart.module.css";

/**
 * Cart (M3) — reads straight from `useCart()`; there's no unique server
 * data to fetch (the cart store already resolves line pricing from the
 * catalog it loads internally), so this page is a client component
 * directly rather than the usual server/client split.
 */
export default function CartPage() {
  const router = useRouter();
  const { items, ready, updateQty, removeItem, lineInfo, subtotal, count } = useCart();

  const shipping = computeShipping(subtotal);
  const cashback = computeCashback(subtotal);
  const total = subtotal + shipping;

  return (
    <section className={clsx("container", styles.page)}>
      <div className={styles.header}>
        <h1 className={styles.title}>Your cart</h1>
        <span className={styles.count}>
          {count} item{count === 1 ? "" : "s"}
        </span>
      </div>

      {!ready ? (
        <p className={styles.loading}>Loading your cart…</p>
      ) : items.length === 0 ? (
        <div className={styles.empty}>
          <ShoppingBag size={40} strokeWidth={1.4} />
          <p className={styles.emptyTitle}>Your cart is empty</p>
          <p className={styles.emptyCopy}>
            Browse the shop or build a gift hamper to get started.
          </p>
          <div className={styles.emptyActions}>
            <Button variant="primary" onClick={() => router.push("/shop")}>
              Continue shopping
            </Button>
            <Button variant="secondary" onClick={() => router.push("/hamper")}>
              Build a hamper
            </Button>
          </div>
        </div>
      ) : (
        <div className={styles.layout}>
          <div className={styles.lines}>
            {items.map((item) => {
              const info = lineInfo(item);
              return (
                <CartLineRow
                  key={item.id}
                  info={info}
                  onQtyChange={(quantity) => updateQty(item.id, quantity)}
                  onRemove={() => removeItem(item.id)}
                />
              );
            })}
          </div>

          <aside className={styles.aside}>
            <StickySummary
              title="Order summary"
              stickyOnMobile
              lines={[
                { label: "Subtotal", value: formatCurrency(subtotal) },
                {
                  label: "Shipping",
                  value: shipping === 0 ? "Free" : formatCurrency(shipping),
                },
                { label: "Total", value: formatCurrency(total), emphasis: true },
              ]}
              cashbackLabel={`Earn ${formatCurrency(cashback)} wallet cashback on this order`}
              footnote={
                shipping > 0
                  ? `Free shipping on orders over ${formatCurrency(FREE_SHIPPING_THRESHOLD)}`
                  : undefined
              }
            >
              <Button variant="primary" onClick={() => router.push("/checkout")}>
                Proceed to checkout →
              </Button>
            </StickySummary>
            <Link href="/shop" className={styles.continueLink}>
              ← Continue shopping
            </Link>
          </aside>
        </div>
      )}
    </section>
  );
}
