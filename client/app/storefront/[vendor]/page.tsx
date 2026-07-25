import clsx from "clsx";
import { notFound } from "next/navigation";
import { StoreHeader } from "@/components/storefront/StoreHeader";
import { ProductGridCard } from "@/components/product/ProductGridCard";
import { ReviewList } from "@/components/review/ReviewList";
import { getProductsByVendor, getVendor, getVendorReviews } from "@/lib/api";
import styles from "./Storefront.module.css";

export interface StorefrontPageProps {
  params: Promise<{ vendor: string }>;
}

/**
 * Maker/vendor storefront — spec'd but not in the prototype (screens.md
 * "To build"). Built from the same design language as the rest of M2:
 * store header (banner, avatar, rating, follow, bio) + that vendor's
 * ProductCard grid + their reviews.
 */
export default async function StorefrontPage({ params }: StorefrontPageProps) {
  const { vendor: vendorSlug } = await params;
  const vendor = await getVendor(vendorSlug);
  if (!vendor) notFound();

  const [products, reviews] = await Promise.all([
    getProductsByVendor(vendor.id),
    getVendorReviews(vendor.id),
  ]);

  return (
    <>
      <section className={clsx("container", styles.headerWrap)}>
        <StoreHeader vendor={vendor} />
      </section>

      <section className={clsx("container", styles.section)}>
        <h2 className={styles.sectionTitle}>
          From {vendor.name} ({products.length})
        </h2>
        {products.length === 0 ? (
          <p className={styles.empty}>No products listed yet.</p>
        ) : (
          <div className={styles.grid}>
            {products.map((product) => (
              <ProductGridCard
                key={product.id}
                product={product}
                makerName={vendor.name}
                href={`/product/${product.slug}`}
              />
            ))}
          </div>
        )}
      </section>

      <section className={clsx("container", styles.section)}>
        <ReviewList
          reviews={reviews}
          title={`Reviews (${reviews.length})`}
          emptyLabel="No reviews yet for this maker."
        />
      </section>
    </>
  );
}
