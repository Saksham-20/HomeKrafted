/* Shared preview fixtures. Real rows from the app's own mock catalogue
   (lib/data), with image `src` stripped: the bundle ships no photography,
   so ImageSlot renders its labelled placeholder instead of a 404. */
import { products, vendors, snacks } from "@/lib/data";
import type { Product, Snack, Vendor } from "@/lib/types";

const stripImages = <T extends { images?: { placeholder: string; src?: string; ratio?: string }[] }>(row: T): T => ({
  ...row,
  images: row.images?.map(({ src: _src, ...rest }) => rest),
});

export const demoProducts: Product[] = products.slice(0, 4).map(stripImages);
export const demoProduct: Product = demoProducts[0];
export const demoVendors: Vendor[] = vendors.slice(0, 4);
export const demoVendor: Vendor = demoVendors[0];
export const demoSnacks: Snack[] = snacks.slice(0, 4).map(({ imageSrc: _s, ...s }) => s);
export const demoSnack: Snack = demoSnacks[0];

/** A neutral card-sized frame so a preview cell isn't edge-to-edge. */
export const cell: React.CSSProperties = { display: "flex", gap: 16, flexWrap: "wrap", alignItems: "flex-start" };
export const cardWidth: React.CSSProperties = { width: 260 };

import { categories, occasions } from "@/lib/data";
import type { Category, Occasion } from "@/lib/types";

/* The four craft categories, chosen because CraftIcon has line art for their
   slugs - a food category with its photograph stripped falls back to one
   generic gift glyph, so a row of them would render four identical tiles. */
const CRAFT_SLUGS = ["candles-home", "handmade-jewellery", "art-prints", "personalised-gifts"];
export const demoCategories: Category[] = CRAFT_SLUGS
  .map((slug) => categories.find((c) => c.slug === slug))
  .filter((c): c is Category => Boolean(c))
  .map(({ imageSrc: _s, ...c }) => c);
export const demoOccasions: Occasion[] = occasions.slice(0, 4).map(({ imageSrc: _s, ...o }) => o);

import { walletTransactions, laundryServices } from "@/lib/data";
import type { WalletTransaction, LaundryService } from "@/lib/types";

export const demoTransactions: WalletTransaction[] = walletTransactions.slice(0, 4);
/** Laundry is withdrawn (M19) but ServiceCard still ships; its own seed rows are the honest props. */
export const demoServices: LaundryService[] = laundryServices.slice(0, 3);
