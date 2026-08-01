import clsx from "clsx";
import styles from "./RouteSkeleton.module.css";

export type RouteSkeletonVariant = "grid" | "page" | "list";

export interface RouteSkeletonProps {
  /**
   * `grid` — a heading plus a card grid (listing routes).
   * `page` — a heading plus stacked prose/panel blocks (detail routes).
   * `list` — a heading plus table-ish rows (dashboard routes).
   */
  variant?: RouteSkeletonVariant;
  /** How many cards/rows to draw. Aim for the real page's usual density. */
  count?: number;
  /** Announced to screen readers while the route streams in. */
  label?: string;
}

/**
 * Route-level loading placeholder for `loading.tsx` files.
 *
 * Deliberately shape-matched rather than a spinner: the surrounding
 * chrome (header, seller/admin shell) is already painted by the layout
 * when this renders, so a bare spinner in the content well reads as a
 * broken page. Blocks are inert — `aria-hidden`, with one polite live
 * label doing the announcing.
 */
export function RouteSkeleton({
  variant = "page",
  count = 6,
  label = "Loading…",
}: RouteSkeletonProps) {
  return (
    <div className={clsx("container", styles.wrap)}>
      <span className="hk-sr-only" role="status" aria-live="polite">
        {label}
      </span>
      <div className={styles.head} aria-hidden="true">
        <span className={styles.eyebrowBar} />
        <span className={styles.titleBar} />
      </div>
      <div
        className={clsx(
          variant === "grid" && styles.grid,
          variant === "list" && styles.list,
          variant === "page" && styles.page,
        )}
        aria-hidden="true"
      >
        {Array.from({ length: count }, (_, index) => (
          <span
            key={index}
            className={clsx(
              styles.block,
              variant === "grid" && styles.card,
              variant === "list" && styles.row,
              variant === "page" && styles.slab,
            )}
          />
        ))}
      </div>
    </div>
  );
}
