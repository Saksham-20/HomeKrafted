import clsx from "clsx";
import { getCategories, getOccasions, getProducts, getVendors } from "@/lib/api";
import { ShopClient } from "./ShopClient";
import styles from "./Shop.module.css";

export interface ShopPageProps {
  searchParams: Promise<{ category?: string; occasion?: string }>;
}

/**
 * Shop listing (Gifting Marketplace browse) — server page fetches the full
 * mock catalog via `lib/api` and hands it to `<ShopClient>`, which owns all
 * interactive filter/sort/pagination state. `?category=` / `?occasion=`
 * (set by Home's category tiles + occasion tiles) seed the sidebar's
 * initial selection.
 */
export default async function ShopPage({ searchParams }: ShopPageProps) {
  const params = await searchParams;
  const [products, categories, occasions, vendors] = await Promise.all([
    getProducts(),
    getCategories(),
    getOccasions(),
    getVendors(),
  ]);

  const vendorNameById = Object.fromEntries(vendors.map((vendor) => [vendor.id, vendor.name]));

  return (
    <>
      <div className={clsx("container", styles.breadcrumbWrap)}>
        <span className={styles.breadcrumb}>
          Home / Shop / <span className={styles.breadcrumbCurrent}>Homemade Foods</span>
        </span>
        <h1 className={styles.title}>Homemade Foods</h1>
        <p className={styles.subtitle}>
          {products.length} small-batch products from home kitchens across India
        </p>
      </div>
      <ShopClient
        products={products}
        categories={categories}
        occasions={occasions}
        vendorNameById={vendorNameById}
        initialCategory={params.category}
        initialOccasion={params.occasion}
      />
    </>
  );
}
