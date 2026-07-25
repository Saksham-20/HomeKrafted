import { getProducts, getVendors } from "@/lib/api";
import { WishlistPageClient } from "@/components/account/WishlistPageClient";

/**
 * Wishlist (M7a) — server wrapper: fetches the full product catalog +
 * vendor names (static reference data), hands off to the client screen
 * which filters that catalog down to `useWishlist().productIds` — the
 * real, `localStorage`-persisted wishlist store wired up in this
 * milestone (see `lib/wishlist/WishlistContext.tsx`).
 */
export default async function WishlistPage() {
  const [products, vendors] = await Promise.all([getProducts(), getVendors()]);
  const vendorNameById = Object.fromEntries(vendors.map((vendor) => [vendor.id, vendor.name]));

  return <WishlistPageClient products={products} vendorNameById={vendorNameById} />;
}
