import type { Metadata } from "next";
import clsx from "clsx";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ProductGridCard } from "@/components/product/ProductGridCard";
import { getCollection, getOccasions, getProducts, getVendors } from "@/lib/api";
import { absoluteUrl, jsonLdProps, pageMetadata } from "@/lib/seo";
import styles from "./Guide.module.css";

export interface GuidePageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: GuidePageProps): Promise<Metadata> {
  const { slug } = await params;
  const guide = await getCollection(slug);
  if (!guide) return { title: "Guide not found" };

  return pageMetadata({
    title: guide.title,
    description:
      guide.description ??
      `A hand-picked edit of homemade gifts from kitchens across the Chandigarh tricity.`,
    path: `/guides/${guide.slug}`,
    image: guide.imageSrc,
  });
}

/**
 * `/guides/[slug]` (M16, H8) — a curated gift guide with its own page.
 *
 * `Collection` had existed since M2 but was only ever reachable *through*
 * an occasion, so a guide with no occasion attached ("If you have never
 * ordered home-made before") had nowhere to live and could not be linked
 * or shared. This is that page.
 *
 * `/collections/[occasion]` is unchanged and still uses a collection's
 * hand-picked ordering where one exists — the two routes answer different
 * questions ("what do I send for Diwali" vs "what is in this edit"), and
 * merging them would mean an occasion could only ever have one guide.
 */
export default async function GuidePage({ params }: GuidePageProps) {
  const { slug } = await params;
  const guide = await getCollection(slug);
  if (!guide) notFound();

  const [allProducts, vendors, occasions] = await Promise.all([
    getProducts(),
    getVendors(),
    getOccasions(),
  ]);

  // Membership order is the curator's order (`CollectionProduct.sortOrder`),
  // so the list is mapped in `productIds` order rather than filtered —
  // and a product pulled from sale drops out instead of 404ing the page.
  const products = guide.productIds
    .map((id) => allProducts.find((p) => p.id === id))
    .filter((p): p is NonNullable<typeof p> => Boolean(p));

  const vendorNameById = Object.fromEntries(vendors.map((vendor) => [vendor.id, vendor.name]));
  const occasion = guide.occasionId
    ? occasions.find((o) => o.id === guide.occasionId)
    : undefined;

  // An ordered, hand-picked list of products is an `ItemList` — the one
  // schema.org type that says "somebody chose this order on purpose".
  const listJsonLd: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: guide.title,
    ...(guide.description ? { description: guide.description } : {}),
    url: absoluteUrl(`/guides/${guide.slug}`),
    numberOfItems: products.length,
    itemListElement: products.map((product, index) => ({
      "@type": "ListItem",
      position: index + 1,
      url: absoluteUrl(`/product/${product.slug}`),
      name: product.name,
    })),
  };

  return (
    <>
      <script {...jsonLdProps(listJsonLd)} />
      <div className={clsx("container", styles.heroWrap)}>
        <span className={styles.breadcrumb}>
          <Link href="/collections" className={styles.breadcrumbLink}>
            Occasions
          </Link>{" "}
          / <span className={styles.breadcrumbCurrent}>{guide.title}</span>
        </span>
        <h1 className={styles.title}>{guide.title}</h1>
        {guide.description && <p className={styles.description}>{guide.description}</p>}
        <p className={styles.count}>
          {products.length} pick{products.length === 1 ? "" : "s"}
          {occasion && (
            <>
              {" · "}
              <Link href={`/collections/${occasion.slug}`} className={styles.occasionLink}>
                everything for {occasion.name}
              </Link>
            </>
          )}
        </p>
      </div>

      <section className={clsx("container", styles.section)}>
        {products.length === 0 ? (
          <p className={styles.empty}>
            Nothing in this guide is available right now. Try{" "}
            <Link href="/shop" className={styles.occasionLink}>
              the full catalogue
            </Link>
            .
          </p>
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
