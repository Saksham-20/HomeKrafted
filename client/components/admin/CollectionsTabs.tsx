import Link from "next/link";
import clsx from "clsx";
import styles from "./CatalogTabs.module.css";

export interface CollectionsTabsProps {
  active: "collections" | "promo";
}

/** Shared sub-nav for `/admin/collections` and `/admin/collections/promo` — reuses `CatalogTabs`'s CSS recipe (same 2-tab Link pattern). */
export function CollectionsTabs({ active }: CollectionsTabsProps) {
  return (
    <div className={styles.tabs} role="tablist" aria-label="Collections view">
      <Link
        href="/admin/collections"
        className={clsx(styles.tab, active === "collections" && styles.tabActive)}
        aria-current={active === "collections" ? "page" : undefined}
      >
        Collections
      </Link>
      <Link
        href="/admin/collections/promo"
        className={clsx(styles.tab, active === "promo" && styles.tabActive)}
        aria-current={active === "promo" ? "page" : undefined}
      >
        Home promo content
      </Link>
    </div>
  );
}
