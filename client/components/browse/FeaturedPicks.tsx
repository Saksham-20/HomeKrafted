"use client";

import Link from "next/link";
import { ImageSlot } from "@/components/placeholder/ImageSlot";
import { formatCurrency } from "@/lib/format";
import { listingPrice } from "@/lib/kitchens";
import type { Product } from "@/lib/types";
import { rotationWindow, useFeaturedRotation } from "./useFeaturedRotation";
import styles from "./FeaturedPicks.module.css";

/** Pills on screen at once; the rest rotate through. */
const VISIBLE = 4;

export interface FeaturedPicksProps {
  /** The ranked pool, best first — the strip shows a rotating window of it. */
  products: Product[];
  vendorNameById: Record<string, string>;
}

/**
 * The hero band's "Featured picks" row (M59c) — the gifts-side sibling of
 * `FeaturedKitchens`: /gifts browses products, so its hero features
 * products. Price comes from `listingPrice` (the default option, the same
 * sum every card uses), never re-derived arithmetic. The window rotates
 * one listing at a time (`useFeaturedRotation` — paused under pointer or
 * focus, still under reduced motion).
 */
export function FeaturedPicks({ products, vendorNameById }: FeaturedPicksProps) {
  const { offset, pauseHandlers } = useFeaturedRotation(products.length, VISIBLE);
  if (products.length === 0) return null;
  const shown = rotationWindow(products, offset, VISIBLE);
  return (
    <div className={styles.strip} {...pauseHandlers}>
      <span className={styles.label}>Featured picks</span>
      <ul className={styles.row}>
        {shown.map((product) => (
          <li key={product.id} className={styles.item}>
            <Link href={`/product/${product.slug}`} className={styles.card}>
              <span className={styles.thumb}>
                {/* alt="" — the product's name is the next node (ImageSlot's rule). */}
                <ImageSlot
                  ratio="1/1"
                  label={product.images[0]?.placeholder ?? product.name}
                  alt=""
                  src={product.images[0]?.src}
                  sizes="56px"
                  compact
                />
              </span>
              <span className={styles.body}>
                <span className={styles.name}>{product.name}</span>
                <span className={styles.meta}>
                  {formatCurrency(listingPrice(product))}
                  {vendorNameById[product.vendorId] ? ` · ${vendorNameById[product.vendorId]}` : ""}
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
