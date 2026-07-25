import Link from "next/link";
import clsx from "clsx";
import { notFound } from "next/navigation";
import { ProductGallery } from "@/components/product/ProductGallery";
import { ProductPurchasePanel } from "@/components/product/ProductPurchasePanel";
import { ProductTabs } from "@/components/product/ProductTabs";
import {
  getCategoryById,
  getProduct,
  getProductReviews,
  getVendorById,
} from "@/lib/api";
import styles from "./ProductDetail.module.css";

export interface ProductPageProps {
  params: Promise<{ slug: string }>;
}

/**
 * Product detail — ported from the prototype's gallery + info layout.
 * Gallery, maker eyebrow (links to storefront), title, rating, price/MRP/
 * discount, wallet-cashback line, weight selector + quantity + add-to-cart
 * (no-op, M3 owns cart), add-to-hamper, gift block, description/spec tabs
 * and Reviews.
 */
export default async function ProductPage({ params }: ProductPageProps) {
  const { slug } = await params;
  const product = await getProduct(slug);
  if (!product) notFound();

  const [vendor, category, reviews] = await Promise.all([
    getVendorById(product.vendorId),
    getCategoryById(product.categoryId),
    getProductReviews(product.id),
  ]);

  return (
    <>
      <div className={clsx("container", styles.breadcrumbWrap)}>
        <span className={styles.breadcrumb}>
          Home / Shop{category ? ` / ${category.name}` : ""} /{" "}
          <span className={styles.breadcrumbCurrent}>{product.name}</span>
        </span>
      </div>

      <section className={clsx("container", styles.layout)}>
        <ProductGallery images={product.images} productName={product.name} />

        <div className={styles.info}>
          {vendor && (
            <Link href={`/storefront/${vendor.slug}`} className={styles.maker}>
              {vendor.name}
            </Link>
          )}
          <h1 className={styles.title}>{product.name}</h1>
          <div className={styles.ratingRow}>
            <span className={styles.stars} aria-hidden="true">
              ★★★★★
            </span>
            <span className={styles.ratingText}>
              {product.rating.toFixed(1)} · {product.reviewCount} reviews
            </span>
          </div>

          <ProductPurchasePanel product={product} />
        </div>
      </section>

      <section className={clsx("container", styles.tabsWrap)}>
        <ProductTabs product={product} reviews={reviews} />
      </section>
    </>
  );
}
