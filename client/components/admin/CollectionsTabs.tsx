import Link from "next/link";
import clsx from "clsx";
import styles from "./CatalogTabs.module.css";

export interface CollectionsTabsProps {
  active: "collections" | "occasions" | "promo";
}

/**
 * Shared sub-nav for the three merchandising screens — reuses
 * `CatalogTabs`'s CSS recipe. "Occasions" (M16) is where festival dates
 * are rolled forward each year.
 *
 * A `<nav>`, not a `role="tablist"`, for the reason written on
 * `CatalogTabs`: these are links to pages, and axe fails a tablist whose
 * children are anchors.
 */
export function CollectionsTabs({ active }: CollectionsTabsProps) {
  return (
    <nav className={styles.tabs} aria-label="Collections view">
      <Link
        href="/admin/collections"
        className={clsx(styles.tab, active === "collections" && styles.tabActive)}
        aria-current={active === "collections" ? "page" : undefined}
      >
        Collections
      </Link>
      <Link
        href="/admin/collections/occasions"
        className={clsx(styles.tab, active === "occasions" && styles.tabActive)}
        aria-current={active === "occasions" ? "page" : undefined}
      >
        Occasions
      </Link>
      <Link
        href="/admin/collections/promo"
        className={clsx(styles.tab, active === "promo" && styles.tabActive)}
        aria-current={active === "promo" ? "page" : undefined}
      >
        Home page bands
      </Link>
    </nav>
  );
}
