import type { Metadata } from "next";
import clsx from "clsx";
import { notFound } from "next/navigation";
import { EmptyState } from "@/components/feedback/EmptyState";
import { ProductGridCard } from "@/components/product/ProductGridCard";
import {
  getCollectionByOccasion,
  getOccasion,
  getProducts,
  getProductsByOccasion,
  getVendors,
} from "@/lib/api";
import { pageMetadata } from "@/lib/seo";
import styles from "./Collection.module.css";

export interface CollectionPageProps {
  params: Promise<{ occasion: string }>;
}

/**
 * Occasion pages are the site's seasonal search surface — "diwali gift
 * hamper", "housewarming gift" — and until M15 every one of them shared
 * the site-wide title.
 */
export async function generateMetadata({ params }: CollectionPageProps): Promise<Metadata> {
  const { occasion: occasionSlug } = await params;
  const occasion = await getOccasion(occasionSlug);
  if (!occasion) return { title: "Collection not found" };

  const collection = await getCollectionByOccasion(occasion.id);

  return pageMetadata({
    title: collection?.title ?? `${occasion.name} gifts`,
    description:
      collection?.description ??
      `Handpicked ${occasion.name.toLowerCase()} gifts from home kitchens and makers across the Chandigarh tricity.`,
    path: `/collections/${occasion.slug}`,
  });
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
          <EmptyState
            title={`Nothing is tagged for ${occasion.name} yet.`}
            body="Makers tag their listings to occasions as they add them, so this fills in as the date gets closer. The full catalogue has everything they sell in the meantime."
            action={{ href: "/shop", label: "Browse everything" }}
          />
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
