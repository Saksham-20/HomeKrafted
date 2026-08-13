import Link from "next/link";
import clsx from "clsx";
import { notFound } from "next/navigation";
import { ProductGallery } from "@/components/product/ProductGallery";
import { ProductPurchasePanel } from "@/components/product/ProductPurchasePanel";
import { ProductTabs } from "@/components/product/ProductTabs";
import type { Metadata } from "next";
import {
  getCategoryById,
  getProduct,
  getProductReviews,
  getVendorById,
} from "@/lib/api";
import { absoluteUrl, jsonLdProps, pageMetadata, SITE_NAME } from "@/lib/seo";
import styles from "./ProductDetail.module.css";

export interface ProductPageProps {
  params: Promise<{ slug: string }>;
}

/**
 * Every product page shared one site-wide title and description until
 * M15 — nothing distinguished a mango pickle from a chocolate bark to a
 * crawler. Falls back to the generic title when the slug doesn't resolve
 * (the page itself `notFound()`s a moment later).
 */
export async function generateMetadata({ params }: ProductPageProps): Promise<Metadata> {
  const { slug } = await params;
  const product = await getProduct(slug);
  if (!product) return { title: "Product not found" };

  const vendor = await getVendorById(product.vendorId);
  const maker = vendor ? ` by ${vendor.name}` : "";

  return pageMetadata({
    title: `${product.name}${maker}`,
    // The listing's own description, trimmed to a length that survives a
    // search snippet rather than being cut off mid-sentence.
    description:
      product.description.length > 155
        ? `${product.description.slice(0, 152).trimEnd()}…`
        : product.description,
    path: `/product/${product.slug}`,
    image: product.images[0]?.src,
    type: "article",
  });
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

  const price = product.weightOptions.find((w) => w.sku === product.defaultWeightSku);

  // Product structured data — what turns a listing into a rich result
  // with a price and a star rating. `aggregateRating` is only emitted
  // when reviews actually exist: claiming a rating with no reviews behind
  // it is exactly the kind of thing that earns a manual penalty.
  const productJsonLd: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    description: product.description,
    url: absoluteUrl(`/product/${product.slug}`),
    ...(product.images[0]?.src ? { image: absoluteUrl(product.images[0].src) } : {}),
    ...(vendor ? { brand: { "@type": "Brand", name: vendor.name } } : {}),
    ...(price
      ? {
          offers: {
            "@type": "Offer",
            price: price.price,
            priceCurrency: "INR",
            availability: product.isAvailable
              ? "https://schema.org/InStock"
              : "https://schema.org/OutOfStock",
            url: absoluteUrl(`/product/${product.slug}`),
            seller: { "@type": "Organization", name: vendor?.name ?? SITE_NAME },
          },
        }
      : {}),
    ...(reviews.length > 0
      ? {
          aggregateRating: {
            "@type": "AggregateRating",
            ratingValue: product.rating,
            reviewCount: reviews.length,
          },
        }
      : {}),
  };

  return (
    <>
      <script {...jsonLdProps(productJsonLd)} />
      <div className={clsx("container", styles.breadcrumbWrap)}>
        <span className={styles.breadcrumb}>
          Home / Homemade Food{category ? ` / ${category.name}` : ""} /{" "}
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
          {/* Five filled stars beside "0.0 · 0 reviews" was the worst of
              these: the decoration says five, the number says zero, and
              neither is true of a listing nobody has reviewed. */}
          <div className={styles.ratingRow}>
            {product.reviewCount > 0 ? (
              <>
                <span className={styles.stars} aria-hidden="true">
                  ★★★★★
                </span>
                <span className={styles.ratingText}>
                  {product.rating.toFixed(1)} · {product.reviewCount} reviews
                </span>
              </>
            ) : (
              <span className={styles.ratingText}>No reviews yet</span>
            )}
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
