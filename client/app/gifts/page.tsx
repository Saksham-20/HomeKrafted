import Link from "next/link";
import clsx from "clsx";
import { getCraftProducts, getVendors } from "@/lib/api";
import { getBuyerCoords } from "@/lib/location/server";
import { ProductGridCard } from "@/components/product/ProductGridCard";
import { pageMetadata } from "@/lib/seo";
import styles from "./Gifts.module.css";

/**
 * Handcrafted Gifts (M20) — the platform's second vertical.
 *
 * Same reasoning as `/hamper` for `force-dynamic`: this reads the `hk_loc`
 * cookie, and `getBuyerCoords` swallows the error `cookies()` throws during
 * a prerender, which hides the per-visitor signal from Next and leaves the
 * route eligible for static export. That turned into a build-time fetch
 * against an API that wasn't up yet.
 */
export const dynamic = "force-dynamic";

export const metadata = pageMetadata({
  title: "Handcrafted gifts, made by hand",
  description:
    "Handmade décor, candles, art, jewellery and personalised gifts from independent makers — most posted anywhere in India.",
  path: "/gifts",
});

export default async function GiftsPage() {
  const near = await getBuyerCoords();
  const [gifts, vendors] = await Promise.all([getCraftProducts(near), getVendors()]);

  const vendorNameById = Object.fromEntries(vendors.map((vendor) => [vendor.id, vendor.name]));

  return (
    <>
      <div className={clsx("container", styles.heroWrap)}>
        <span className={styles.breadcrumb}>
          Home / <span className={styles.breadcrumbCurrent}>Handcrafted gifts</span>
        </span>
        <h1 className={styles.title}>Handcrafted gifts</h1>
        <p className={styles.description}>
          Handmade décor, candles, art, jewellery and personalised pieces, made by independent
          makers.
        </p>
        {/*
          The genuinely useful difference between the two verticals, said
          plainly rather than discovered at checkout: food is cooked nearby
          and driven to you, craft goes in the post.
        */}
        <p className={styles.shipping}>
          Most gifts here ship <strong>anywhere in India</strong> — unlike homemade food, which
          only travels as far as the kitchen delivers.
        </p>
      </div>

      <section className={clsx("container", styles.section)}>
        {gifts.length === 0 ? (
          <div className={styles.empty}>
            <p className={styles.emptyLead}>No handcrafted gifts listed yet.</p>
            <p className={styles.emptyBody}>
              This side of Homekrafted is just opening. Makers are being onboarded now — in the
              meantime, the gift hampers are ready to send today.
            </p>
            <Link href="/hamper" className={styles.emptyLink}>
              Browse gift hampers →
            </Link>
          </div>
        ) : (
          <div className={styles.grid}>
            {gifts.map((product, index) => (
              <ProductGridCard
                key={product.id}
                product={product}
                makerName={vendorNameById[product.vendorId] ?? "Homekrafted"}
                href={`/product/${product.slug}`}
                // First row only — see `ShopClient`'s grid for why it is
                // the row and not a single card.
                priority={index < 3}
              />
            ))}
          </div>
        )}
      </section>
    </>
  );
}
