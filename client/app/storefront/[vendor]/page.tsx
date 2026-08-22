import type { Metadata } from "next";
import clsx from "clsx";
import { notFound } from "next/navigation";
import { StoreHeader } from "@/components/storefront/StoreHeader";
import { TrustPanel } from "@/components/storefront/TrustPanel";
import { KitchenProfile } from "@/components/storefront/KitchenProfile";
import { ProductGridCard } from "@/components/product/ProductGridCard";
import { ReviewList } from "@/components/review/ReviewList";
import {
  getProductsByVendor,
  getVendor,
  getVendorAvailability,
  getVendorProfile,
  getVendorReviews,
} from "@/lib/api";
import { describeSlot, firstAvailableSlot } from "@/lib/schedule";
import { ownAvatarSrc } from "@/lib/maker-portrait";
import { absoluteUrl, jsonLdProps, pageMetadata } from "@/lib/seo";
import styles from "./Storefront.module.css";

export interface StorefrontPageProps {
  params: Promise<{ vendor: string }>;
}

/**
 * A storefront is the page a HomeKrafter shares — it needs to unfurl as
 * *them*, not as the generic site card it did before M15.
 */
export async function generateMetadata({ params }: StorefrontPageProps): Promise<Metadata> {
  const { vendor: vendorSlug } = await params;
  const vendor = await getVendor(vendorSlug);
  if (!vendor) return { title: "HomeKrafter not found" };

  return pageMetadata({
    title: `${vendor.name} — ${vendor.location}`,
    description:
      vendor.bio.length > 155 ? `${vendor.bio.slice(0, 152).trimEnd()}…` : vendor.bio,
    path: `/storefront/${vendor.slug}`,
    // `ownAvatarSrc`, not the raw column: a pre-M28 row still holds the
    // shared stock portrait, and the share card for *this* kitchen is the
    // worst place to put a stranger's face — it is what lands in a
    // WhatsApp preview when somebody forwards their shop.
    image: vendor.bannerSrc ?? ownAvatarSrc(vendor.avatarSrc),
  });
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

  const [products, reviews, profile, availability] = await Promise.all([
    getProductsByVendor(vendor.id),
    getVendorReviews(vendor.id),
    getVendorProfile(vendor.slug),
    getVendorAvailability(vendor.slug),
  ]);

  // The clock is read once, here, and shipped as a string (M16). A
  // component recomputing "the next free slot" during hydration is the
  // React #418 failure CLAUDE.md records from M12.
  const now = new Date();
  const nextSlot = firstAvailableSlot(now, availability);
  const nextAvailableLabel = nextSlot
    ? describeSlot(nextSlot.dayId, nextSlot.windowId, now, availability)
    : undefined;

  // A home kitchen with a real address and a delivery radius is a
  // `LocalBusiness` in schema.org terms, which is what puts it in the
  // local pack for "homemade pickles near me". `geo` is already on the
  // record for the delivery-radius filter, so it costs nothing to state.
  const storeJsonLd: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    name: vendor.name,
    description: vendor.bio,
    url: absoluteUrl(`/storefront/${vendor.slug}`),
    // Same reason as the OG image above — and this one is read by Google,
    // which will happily attach the borrowed face to their business.
    ...(ownAvatarSrc(vendor.avatarSrc)
      ? { image: absoluteUrl(ownAvatarSrc(vendor.avatarSrc)!) }
      : {}),
    address: { "@type": "PostalAddress", addressLocality: vendor.location, addressCountry: "IN" },
    geo: { "@type": "GeoCoordinates", latitude: vendor.lat, longitude: vendor.lng },
    // M16. `knowsLanguage`, opening hours and price floor are real
    // schema.org `LocalBusiness` fields, and a buyer searching "home food
    // near me open Sunday" is a query these answer. Only emitted when the
    // HomeKrafter actually stated them — a guessed opening time in
    // structured data is worse than none.
    ...(profile?.languages.length ? { knowsLanguage: profile.languages } : {}),
    ...(profile?.workingDays.length && profile.opensAt && profile.closesAt
      ? {
          openingHoursSpecification: {
            "@type": "OpeningHoursSpecification",
            dayOfWeek: profile.workingDays.map(
              (day) =>
                ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][day],
            ),
            opens: profile.opensAt,
            closes: profile.closesAt,
          },
        }
      : {}),
    ...(profile?.minOrderValue != null
      ? { priceRange: `From ${profile.minOrderValue} INR` }
      : {}),
    ...(vendor.reviewCount > 0
      ? {
          aggregateRating: {
            "@type": "AggregateRating",
            ratingValue: vendor.rating,
            reviewCount: vendor.reviewCount,
          },
        }
      : {}),
  };

  return (
    <>
      <script {...jsonLdProps(storeJsonLd)} />
      <section className={clsx("container", styles.headerWrap)}>
        <StoreHeader vendor={vendor} profile={profile} />
      </section>

      {/* Profile before products, on purpose. The thing a buyer is
          deciding on a home-kitchen storefront is not "which jar" but
          "do I want food from this person's house" — the products are
          the second question. */}
      {profile && (
        <section className={clsx("container", styles.section)}>
          <KitchenProfile
            profile={profile}
            vendorName={vendor.name}
            nextAvailableLabel={nextAvailableLabel}
            availability={availability}
          />
        </section>
      )}

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

      {profile && (
        <section className={clsx("container", styles.section)}>
          <TrustPanel
            trust={profile.trust}
            achievements={profile.achievements}
            stats={profile.stats}
            vendorName={vendor.name}
          />
        </section>
      )}

      <section className={clsx("container", styles.section)}>
        <ReviewList
          reviews={reviews}
          title={`Reviews (${reviews.length})`}
          emptyLabel="No reviews yet for this HomeKrafter."
        />
      </section>
    </>
  );
}
