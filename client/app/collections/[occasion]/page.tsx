import clsx from "clsx";
import { notFound } from "next/navigation";
import { ProductGridCard } from "@/components/product/ProductGridCard";
import {
  getCollectionByOccasion,
  getOccasion,
  getProducts,
  getProductsByOccasion,
  getVendors,
} from "@/lib/api";
import styles from "./Collection.module.css";

export interface CollectionPageProps {
  params: Promise<{ occasion: string }>;
}

/**
 * Occasion collection — spec'd but not in the prototype (screens.md
 * "To build"). Occasion hero + a ProductCard grid filtered to that
 * occasion. Where a curated `Collection` exists for the occasion (Diwali,
 * Corporate — see `lib/data/collections.ts`), its title/description and
 * hand-picked product order are used; otherwise falls back to a plain
 * `getProductsByOccasion` filter so every occasion slug still resolves to
 * a real page.
 */
export default async function CollectionPage({ params }: CollectionPageProps) {
  const { occasion: occasionSlug } = await params;
  const occasion = await getOccasion(occasionSlug);
  if (!occasion) notFound();

  const [collection, allProducts, vendors] = await Promise.all([
    getCollectionByOccasion(occasion.id),
    getProducts(),
    getVendors(),
  ]);

  const products = collection
    ? collection.productIds
        .map((id) => allProducts.find((p) => p.id === id))
        .filter((p): p is NonNullable<typeof p> => Boolean(p))
    : await getProductsByOccasion(occasion.id);

  const vendorNameById = Object.fromEntries(vendors.map((vendor) => [vendor.id, vendor.name]));

  const title = collection?.title ?? `${occasion.name} Gifting Edit`;
  const description =
    collection?.description ??
    `A hand-picked edit of homemade favourites for ${occasion.name.toLowerCase()}.`;

  return (
    <>
      <div className={clsx("container", styles.heroWrap)}>
        <span className={styles.breadcrumb}>
          Home / Collections / <span className={styles.breadcrumbCurrent}>{occasion.name}</span>
        </span>
        <h1 className={styles.title}>{title}</h1>
        <p className={styles.description}>{description}</p>
        <p className={styles.count}>
          {products.length} product{products.length === 1 ? "" : "s"}
        </p>
      </div>

      <section className={clsx("container", styles.section)}>
        {products.length === 0 ? (
          <p className={styles.empty}>No products in this collection yet.</p>
        ) : (
          <div className={styles.grid}>
            {products.map((product) => (
              <ProductGridCard
                key={product.id}
                product={product}
                makerName={vendorNameById[product.vendorId] ?? "Homekrafted"}
                href={`/product/${product.slug}`}
              />
            ))}
          </div>
        )}
      </section>
    </>
  );
}
