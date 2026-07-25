import { notFound } from "next/navigation";
import {
  getCategories,
  getLaundryDays,
  getLaundryServices,
  getLaundrySlots,
  getMealPromo,
  getOccasions,
  getProducts,
  getSnacks,
  getTopupOptions,
  getTransactions,
  getVendors,
  getWallet,
} from "@/lib/api";
import { GalleryClient } from "./GalleryClient";

/**
 * DEV-ONLY component gallery (M1).
 *
 * Renders every components/ui/ primitive in every documented state
 * (default / hover / selected / disabled, where each applies) against
 * real mock data, for visual QA against `handoff/prototype/Homekrafted.dc.html`.
 * Not linked from any nav — reachable only by visiting `/gallery`
 * directly, and only outside production (see the `notFound()` guard
 * below). Safe to delete once every screen milestone (M2-M7) has
 * shipped and exercised these primitives in situ.
 *
 * Server component: fetches everything through `lib/api` (never
 * `lib/data` directly, per the project convention) and hands resolved
 * data down to the interactive `<GalleryClient>`.
 */
export default async function GalleryPage() {
  if (process.env.NODE_ENV === "production") notFound();

  const [
    products,
    vendors,
    snacks,
    laundryServices,
    categories,
    occasions,
    wallet,
    transactions,
    topupOptions,
    laundryDays,
    laundrySlots,
    mealPromo,
  ] = await Promise.all([
    getProducts(),
    getVendors(),
    getSnacks(),
    getLaundryServices(),
    getCategories(),
    getOccasions(),
    getWallet(),
    getTransactions(),
    getTopupOptions(),
    getLaundryDays(),
    getLaundrySlots(),
    getMealPromo(),
  ]);

  const vendorNameById = Object.fromEntries(
    vendors.map((vendor) => [vendor.id, vendor.name]),
  );

  return (
    <GalleryClient
      products={products}
      vendorNameById={vendorNameById}
      snacks={snacks}
      laundryServices={laundryServices}
      categories={categories}
      occasions={occasions}
      wallet={wallet}
      transactions={transactions}
      topupOptions={topupOptions}
      laundryDays={laundryDays}
      laundrySlots={laundrySlots}
      mealPromo={mealPromo}
    />
  );
}
