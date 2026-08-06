import clsx from "clsx";
import { getHamperProducts, getVendors } from "@/lib/api";
import { getBuyerCoords } from "@/lib/location/server";
import { ProductGridCard } from "@/components/product/ProductGridCard";
import { pageMetadata } from "@/lib/seo";
import styles from "./Hamper.module.css";

/**
 * Gift hampers (M18) — **a catalogue, not a builder.**
 *
 * Until now this route was a three-step wizard where a buyer picked a box
 * tier and filled it from the whole catalogue. That is gone. A hamper is
 * now a listing a HomeKrafter creates and prices themselves, and this page
 * is the catalogue filtered to those listings.
 *
 * Two consequences worth stating, because both were reasons for the
 * change. The person assembling the hamper is now the person who knows
 * what travels well together and what is in season — the builder asked a
 * buyer to guess. And a hamper is now an ordinary `Product`, so it
 * inherits reviews, availability, distance filtering, cart, checkout and
 * search rather than needing its own version of each.
 *
 * The retired builder's server-side pieces (`Hamper`, `HamperItem`,
 * `HamperBox`, `POST /cart/hamper`) are deliberately still in place:
 * orders placed before this milestone reference them, and a customer's
 * order history has to keep rendering.
 */
/**
 * Rendered per request, for two reasons that both bite.
 *
 * It reads the `hk_loc` cookie, so its content is per-visitor — but
 * `getBuyerCoords` catches the error `cookies()` throws during a
 * prerender and returns `undefined`, which silently *hides* that signal
 * from Next and leaves the route eligible for static export. The build
 * then tried to fetch the catalogue at build time and failed outright when
 * the API wasn't up yet, which is a deploy-order landmine (`docs/DEPLOY.md`).
 *
 * The second reason outlives the first: hampers are seasonal listings a
 * HomeKrafter adds and removes. A page frozen at build time would keep
 * showing last week's, and keep hiding today's, until the next deploy.
 */
export const dynamic = "force-dynamic";

export const metadata = pageMetadata({
  title: "Gift hampers from home kitchens",
  description:
    "Ready-made gift hampers put together by home kitchens across Chandigarh, Mohali, Panchkula and Zirakpur — festive boxes, sweet and savoury mixes, and curated gifting sets.",
  path: "/hamper",
});

export default async function HamperPage() {
  // Same cookie the other server-rendered listings read — a hamper is
  // made by a nearby kitchen like anything else, and `undefined` (prompt
  // declined, no area picked) means the full list rather than an empty
  // page.
  const near = await getBuyerCoords();
  const [hampers, vendors] = await Promise.all([getHamperProducts(near), getVendors()]);

  const vendorNameById = Object.fromEntries(vendors.map((vendor) => [vendor.id, vendor.name]));

  return (
    <>
      <div className={clsx("container", styles.heroWrap)}>
        <span className={styles.breadcrumb}>
          Home / <span className={styles.breadcrumbCurrent}>Gift hampers</span>
        </span>
        <h1 className={styles.title}>Gift hampers</h1>
        <p className={styles.description}>
          Put together by the kitchens that make what&rsquo;s inside them.
          Every hamper below is assembled, wrapped and priced by one
          HomeKrafter, so what arrives is what they&rsquo;d send their own
          family.
        </p>
        {hampers.length > 0 && (
          <p className={styles.count}>
            {hampers.length} hamper{hampers.length === 1 ? "" : "s"} available
          </p>
        )}
      </div>

      <section className={clsx("container", styles.section)}>
        {hampers.length === 0 ? (
          // A real state, not a placeholder: hampers are seasonal, and a
          // week with none is normal. It says what to do next rather than
          // just reporting emptiness.
          <div className={styles.empty}>
            <p className={styles.emptyLead}>No hampers listed right now.</p>
            <p className={styles.emptyBody}>
              Hampers come and go with the season. In the meantime, the full
              catalogue is open — or tell a kitchen what you have in mind and
              they&rsquo;ll usually put something together.
            </p>
            <a href="/shop" className={styles.emptyLink}>
              Browse everything
            </a>
          </div>
        ) : (
          <div className={styles.grid}>
            {hampers.map((product, index) => (
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
