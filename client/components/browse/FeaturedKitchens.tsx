"use client";

import Link from "next/link";
import { MakerPortrait } from "@/components/vendor/MakerPortrait";
import type { Kitchen } from "@/lib/kitchens";
import { rotationWindow, useFeaturedRotation } from "./useFeaturedRotation";
import styles from "./FeaturedKitchens.module.css";

/** Cards on screen at once; the rest rotate through. */
const VISIBLE = 4;

export interface FeaturedKitchensProps {
  /** The ranked pool, best first — the strip shows a rotating window of it. */
  kitchens: Kitchen[];
}

/**
 * The hero band's "Featured kitchens" row (M59c): compact cards linking
 * to each storefront. Everything shown is derived from the catalogue the
 * page already fetched (the M51 rule — no `GET /kitchens`, no second
 * source of truth), and the M51 honesty rules hold: a rating renders only
 * when reviews exist, otherwise the card says "New kitchen". The window
 * rotates one kitchen at a time (`useFeaturedRotation` — paused under
 * pointer or focus, still under reduced motion).
 */
export function FeaturedKitchens({ kitchens }: FeaturedKitchensProps) {
  const { offset, pauseHandlers } = useFeaturedRotation(kitchens.length, VISIBLE);
  if (kitchens.length === 0) return null;
  const shown = rotationWindow(kitchens, offset, VISIBLE);
  return (
    <div className={styles.strip} {...pauseHandlers}>
      <span className={styles.label}>Featured kitchens</span>
      <ul className={styles.row}>
        {shown.map((kitchen) => (
          <li key={kitchen.vendor.id} className={styles.item}>
            <Link href={`/storefront/${kitchen.vendor.slug}`} className={styles.card}>
              {/* alt="" — the kitchen's name is the next node (MakerPortrait's own rule). */}
              <MakerPortrait vendor={kitchen.vendor} size={44} alt="" />
              <span className={styles.body}>
                <span className={styles.name}>{kitchen.vendor.name}</span>
                <span className={styles.meta}>
                  {kitchen.vendor.reviewCount > 0 ? (
                    <>
                      <span className={styles.star} aria-hidden="true">
                        ★
                      </span>{" "}
                      {kitchen.vendor.rating.toFixed(1)} ·{" "}
                    </>
                  ) : (
                    "New kitchen · "
                  )}
                  {kitchen.dishes.length} {kitchen.dishes.length === 1 ? "dish" : "dishes"}
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
