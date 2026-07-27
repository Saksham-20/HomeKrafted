import Link from "next/link";
import clsx from "clsx";
import styles from "./CatalogTabs.module.css";

export interface CatalogTabsProps {
  active: "products" | "reviews";
}

/**
 * Shared sub-nav for `/admin/catalog` (products) and
 * `/admin/catalog/reviews` — real routes (not client-state tabs like
 * `SellersClient`'s), so this is `Link`-based rather than `Chip`
 * `onClick` state.
 */
export function CatalogTabs({ active }: CatalogTabsProps) {
  return (
    <div className={styles.tabs} role="tablist" aria-label="Catalog view">
      <Link
        href="/admin/catalog"
        className={clsx(styles.tab, active === "products" && styles.tabActive)}
        aria-current={active === "products" ? "page" : undefined}
      >
        Products
      </Link>
      <Link
        href="/admin/catalog/reviews"
        className={clsx(styles.tab, active === "reviews" && styles.tabActive)}
        aria-current={active === "reviews" ? "page" : undefined}
      >
        Reviews
      </Link>
    </div>
  );
}
