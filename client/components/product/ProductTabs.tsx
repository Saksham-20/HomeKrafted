"use client";

import { useState } from "react";
import Link from "next/link";
import clsx from "clsx";
import { ReviewList } from "@/components/review/ReviewList";
import { ReviewForm } from "@/components/review/ReviewForm";
import { Button } from "@/components/ui/Button";
import { useAuth } from "@/lib/auth/AuthContext";
import type { Product, Review } from "@/lib/types";
import styles from "./ProductTabs.module.css";

export interface ProductTabsProps {
  product: Product;
  reviews: Review[];
}

/**
 * Description tabs + spec table, ported from the prototype's product-detail
 * tab row. Two working tabs: "Description" (copy + spec k/v list, side by
 * side on desktop) and "Reviews" (the `ReviewList` — the prototype doesn't
 * show reviews at all, so this tab is a genuine M2 addition per the brief).
 */
export function ProductTabs({ product, reviews: initialReviews }: ProductTabsProps) {
  const [tab, setTab] = useState<"description" | "reviews">("description");
  const { user, ready: authReady } = useAuth();
  const [writing, setWriting] = useState(false);
  // Held locally so a review the visitor just wrote appears immediately —
  // this page is a Server Component render and won't refetch on its own.
  const [reviews, setReviews] = useState(initialReviews);

  const specs: { k: string; v: string }[] = [
    product.ingredients && { k: "Ingredients", v: product.ingredients },
    product.shelfLife && { k: "Shelf life", v: product.shelfLife },
    product.storageInstructions && { k: "Storage", v: product.storageInstructions },
    product.madeIn && { k: "Made in", v: product.madeIn },
  ].filter((row): row is { k: string; v: string } => Boolean(row));

  return (
    <div className={styles.wrap}>
      <div className={styles.tabRow}>
        <button
          type="button"
          className={clsx(styles.tab, tab === "description" && styles.tabActive)}
          onClick={() => setTab("description")}
        >
          Description
        </button>
        <button
          type="button"
          className={clsx(styles.tab, tab === "reviews" && styles.tabActive)}
          onClick={() => setTab("reviews")}
        >
          Reviews ({reviews.length})
        </button>
      </div>

      {tab === "description" ? (
        <div className={styles.descGrid}>
          <p className={styles.desc}>{product.description}</p>
          {specs.length > 0 && (
            <div className={styles.specs}>
              {specs.map((row) => (
                <div key={row.k} className={styles.specRow}>
                  <span className={styles.specKey}>{row.k}</span>
                  <span className={styles.specValue}>{row.v}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className={styles.reviewsPane}>
          {/* The write side only became reachable in M15 — `POST /reviews`
              had existed since M8 with no call site anywhere. The server
              still decides eligibility (a delivered order), so this offers
              the form to any signed-in visitor and lets the refusal come
              back with its reason rather than guessing here. */}
          {writing ? (
            <ReviewForm
              targetType="product"
              targetId={product.id}
              targetName={product.name}
              onSubmitted={(review) => setReviews((current) => [review, ...current])}
              onCancel={() => setWriting(false)}
            />
          ) : authReady && !user ? (
            <p className={styles.reviewPrompt}>
              <Link href="/login">Sign in</Link> to review something you&apos;ve had delivered.
            </p>
          ) : (
            <div className={styles.reviewPrompt}>
              <Button variant="secondary" size="sm" onClick={() => setWriting(true)}>
                Write a review
              </Button>
              <span className={styles.reviewHint}>
                You can review this once an order containing it has been delivered.
              </span>
            </div>
          )}

          <ReviewList
            reviews={reviews}
            emptyLabel="No reviews yet — be the first to review this product."
          />
        </div>
      )}
    </div>
  );
}
