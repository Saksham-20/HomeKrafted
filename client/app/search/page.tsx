import type { Metadata } from "next";
import Link from "next/link";
import clsx from "clsx";
import { SearchForm } from "@/components/search/SearchForm";
import { ProductGridCard } from "@/components/product/ProductGridCard";
import { SnackCard } from "@/components/ui/SnackCard";
import { MakerPortrait } from "@/components/vendor/MakerPortrait";
import { ChannelBadge } from "@/components/ui/ChannelBadge";
import { getBuyerCoords } from "@/lib/location/server";
import { getVendors, search } from "@/lib/api";
import styles from "./Search.module.css";

/**
 * How many cards get `priority` — the first row at the widest layout this
 * grid reaches (1180px container ÷ its own `minmax()` track). Above that
 * row nothing is above the fold, and below it the row is narrower, so a
 * couple of these are eager without being the LCP element; they are all
 * first-screen images either way, so nothing is fetched that was not
 * already needed. A single card is not enough: every card renders the same
 * size, so which one wins LCP is decided by paint order, and at 1280px
 * Next named the second one.
 */
const PRIORITY_CARDS = 5;

export interface SearchPageProps {
  searchParams: Promise<{ q?: string }>;
}

export const metadata: Metadata = {
  title: "Search",
  description:
    "Search homemade gifts, foods, snacks and the HomeKrafters who make them across the Chandigarh tricity.",
  // A search-results URL is per-visitor and infinitely variable — indexing
  // it produces thin duplicate pages, so it stays out of the index while
  // its outbound links stay followable.
  robots: { index: false, follow: true },
};

/** Popular starting points for someone who lands here with an empty box. */
const SUGGESTIONS = ["Pickle", "Ladoo", "Diwali", "Masala", "Cake"];

/**
 * Site search across the three things a shopper looks for: products,
 * HomeKrafters, and snacks. Fans out through `lib/api#search` (see that
 * file for why there is no single `/search` endpoint on the server).
 *
 * Location-aware the same way `/shop` is: reads the `hk_loc` cookie so
 * the server render applies the delivery-radius filter, and degrades to
 * the full catalogue when there is no location — a visitor who declined
 * the prompt still gets results.
 */
export default async function SearchPage({ searchParams }: SearchPageProps) {
  const { q = "" } = await searchParams;
  const near = await getBuyerCoords();
  const [results, vendors] = await Promise.all([search(q, near), getVendors()]);
  const vendorNameById = Object.fromEntries(vendors.map((vendor) => [vendor.id, vendor.name]));

  const hasQuery = results.query.length > 0;

  return (
    <section className={clsx("container", styles.page)}>
      <div className={styles.head}>
        <span className={styles.eyebrow}>Search</span>
        <h1 className={styles.title}>
          {hasQuery ? (
            <>
              {results.total} result{results.total === 1 ? "" : "s"} for{" "}
              <span className={styles.term}>“{results.query}”</span>
            </>
          ) : (
            "What are you looking for?"
          )}
        </h1>
        <SearchForm
          variant="block"
          defaultValue={results.query}
          className={styles.field}
          autoFocus={!hasQuery}
        />
      </div>

      {!hasQuery ? (
        <div className={styles.suggestions}>
          <span className={styles.suggestLabel}>Try</span>
          {SUGGESTIONS.map((suggestion) => (
            <Link
              key={suggestion}
              href={`/search?q=${encodeURIComponent(suggestion.toLowerCase())}`}
              className={styles.suggestChip}
            >
              {suggestion}
            </Link>
          ))}
        </div>
      ) : results.total === 0 ? (
        <div className={styles.empty}>
          <p className={styles.emptyTitle}>Nothing matched “{results.query}”.</p>
          <p className={styles.emptyBody}>
            Try a shorter term, or browse the marketplace — the catalogue is small-batch and
            changes as HomeKrafters cook.
          </p>
          <Link href="/shop" className={styles.emptyCta}>
            Browse homemade food
          </Link>
        </div>
      ) : (
        <>
          {results.products.length > 0 && (
            <div className={styles.section}>
              <h2 className={styles.sectionTitle}>
                Products <span className={styles.count}>{results.products.length}</span>
              </h2>
              <div className={styles.grid}>
                {results.products.map((product, index) => (
                  <ProductGridCard
                    key={product.id}
                    product={product}
                    makerName={vendorNameById[product.vendorId] ?? "Homekrafted"}
                    href={`/product/${product.slug}`}
                    priority={index < PRIORITY_CARDS}
                  />
                ))}
              </div>
            </div>
          )}

          {results.vendors.length > 0 && (
            <div className={styles.section}>
              <h2 className={styles.sectionTitle}>
                HomeKrafters <span className={styles.count}>{results.vendors.length}</span>
              </h2>
              <div className={styles.makerGrid}>
                {results.vendors.map((vendor) => (
                  <Link
                    key={vendor.id}
                    href={`/storefront/${vendor.slug}`}
                    className={styles.makerCard}
                  >
                    <span className={styles.makerAvatar}>
                      {/* Caricature rather than the shared stock face —
                          see components/vendor/MakerPortrait. */}
                      <MakerPortrait vendor={vendor} size={56} alt="" />
                    </span>
                    <span className={styles.makerText}>
                      <span className={styles.makerName}>{vendor.name}</span>
                      <span className={styles.makerMeta}>
                        {vendor.reviewCount > 0 ? `★ ${vendor.rating.toFixed(1)} · ` : ""}
                        {vendor.location}
                      </span>
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {results.snacks.length > 0 && (
            <div className={styles.section}>
              <div className={styles.snackHead}>
                <h2 className={styles.sectionTitle}>
                  Snacks <span className={styles.count}>{results.snacks.length}</span>
                </h2>
                {/* Snacks take no payment on the site (`lib/channel.ts`) —
                    say so here rather than let a result look like a
                    product that can be added to a cart. */}
                <ChannelBadge channel="snacks" />
              </div>
              <div className={styles.grid}>
                {results.snacks.map((snack) => (
                  <Link key={snack.id} href="/snacks" className={styles.snackLink}>
                    <SnackCard snack={snack} />
                  </Link>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}
