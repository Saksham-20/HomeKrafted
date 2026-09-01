import Link from "next/link";
import clsx from "clsx";
import styles from "./CatalogTabs.module.css";

export interface CatalogTabsProps {
  active: "products" | "categories" | "reviews" | "suggestions";
  /** Shelves and occasions waiting on a decision. Omitted (or 0) draws no badge. */
  pendingSuggestions?: number;
}

/**
 * Shared sub-nav for `/admin/catalog` (products), `/admin/catalog/reviews`
 * and `/admin/catalog/suggestions` — real routes (not client-state tabs
 * like `SellersClient`'s), so this is `Link`-based rather than `Chip`
 * `onClick` state.
 *
 * **A `<nav>`, not a `role="tablist"`.** It carried the tablist role from
 * the day it shipped, and axe fails that as `aria-required-children`
 * (critical): a tablist may only contain `role="tab"`, and these are
 * anchors. The role was also a lie about the keyboard model — a real
 * tablist is arrow-key navigable and moves focus between tabs, which
 * this never did and should not, because each one is a page you can
 * open in a new tab. `aria-current="page"` already says which is which,
 * and that is the right word for a link.
 */
export function CatalogTabs({ active, pendingSuggestions = 0 }: CatalogTabsProps) {
  return (
    <nav className={styles.tabs} aria-label="Catalog view">
      <Link
        href="/admin/catalog"
        className={clsx(styles.tab, active === "products" && styles.tabActive)}
        aria-current={active === "products" ? "page" : undefined}
      >
        Products
      </Link>
      <Link
        href="/admin/catalog/categories"
        className={clsx(styles.tab, active === "categories" && styles.tabActive)}
        aria-current={active === "categories" ? "page" : undefined}
      >
        Categories
      </Link>
      <Link
        href="/admin/catalog/reviews"
        className={clsx(styles.tab, active === "reviews" && styles.tabActive)}
        aria-current={active === "reviews" ? "page" : undefined}
      >
        Reviews
      </Link>
      <Link
        href="/admin/catalog/suggestions"
        className={clsx(styles.tab, active === "suggestions" && styles.tabActive)}
        aria-current={active === "suggestions" ? "page" : undefined}
      >
        Suggestions
        {/* The count is on the tab because it is the only thing that says
            somebody is waiting — nothing else on the catalogue screen
            mentions this queue exists. */}
        {pendingSuggestions > 0 && <span className={styles.badge}>{pendingSuggestions}</span>}
      </Link>
    </nav>
  );
}
