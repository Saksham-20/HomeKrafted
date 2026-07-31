/**
 * Seller-scoped API — real as of M8.4b (`server/src/seller/*`, `docs/API.md`
 * "Seller portal (M8.3b)"). Every real branch below hits an owner-scoped
 * `/seller/*` endpoint that resolves the acting seller from the caller's own
 * JWT (`req.user.sellerId`) server-side — **never** the `vendorId`/
 * `sellerId` argument these functions still take. Those arguments are kept
 * on every signature purely so call sites (`components/seller/**`) don't
 * need to change: M8.4b is a body-only swap, exactly like `lib/api/orders.ts`/
 * `laundry.ts` before it. `NEXT_PUBLIC_USE_MOCK=true` keeps the pre-M8.4b
 * mock behavior byte-for-byte (module-level arrays, lost on reload) — see
 * each function's `if (isMockMode())` branch.
 *
 * One function (`updatePartnerBookingSlots`) has no real endpoint yet
 * (`docs/API.md`: "Not built in M8.3b — not in the brief's scope") and
 * stays mock-only unconditionally; `getAllSnackOrders` (M11a's admin-only
 * unscoped snack-order read) is superseded by `lib/api/admin.ts`'s own real
 * `getAllOrdersUnified` (`GET /admin/orders`), so it stays mock-only too —
 * only `lib/api/admin.ts`'s *mock* branch still calls it.
 */

import {
  getProductById as getProductByIdData,
  getVendorById as getVendorByIdData,
  getOwnVendorProfile,
  payouts as seedPayouts,
  products as seedProducts,
  reviews as allReviews,
  seedLaundryBookings,
  seedOrders,
  seedSnackOrders,
  sellers,
  snacks as seedSnacks,
} from "@/lib/data";
import type {
  DietaryTag,
  DietType,
  LaundryBooking,
  LaundryBookingStatus,
  Order,
  OrderStatus,
  Payout,
  Product,
  ProductTag,
  Review,
  Seller,
  Snack,
  SnackCategory,
  SnackOrder,
  SnackOrderStatus,
  OwnVendorProfile,
  Vendor,
  VendorPhoto,
  VendorPhotoKind,
  WeightOption,
} from "@/lib/types";
import { http, isMockMode } from "./http";
import { getPlacedBookings } from "./laundry";
import { getPlacedOrders } from "./orders";

// ---------------------------------------------------------------------------
// Seller / vendor lookups
// ---------------------------------------------------------------------------

/**
 * No real equivalent — `docs/API.md`: "No longer separate lookups; `GET
 * /seller/dashboard` resolves the caller's own seller+vendor server-side."
 * Unused at any real call site (every screen reads `useAuth().seller`
 * instead); left as a plain mock lookup rather than deleted, since it's
 * harmless (a real-mode caller would pass a real DB id that never matches a
 * mock seed id, so this safely resolves `undefined`).
 */
export async function getSeller(sellerId: string): Promise<Seller | undefined> {
  return sellers.find((s) => s.id === sellerId);
}

export async function getSellerVendor(vendorId: string): Promise<Vendor | undefined> {
  if (isMockMode()) return getVendorByIdData(vendorId);
  try {
    return await http.get<Vendor>("/seller/storefront");
  } catch {
    return undefined;
  }
}

// ---------------------------------------------------------------------------
// Listings (maker) — CRUD over a lazily-seeded per-vendor copy of
// `lib/data/products` (mock mode only). Real mode: `GET/POST/PATCH/DELETE
// /seller/listings` (`SellerListingsService`, owner-scoped to the caller's
// own `vendorId`).
// ---------------------------------------------------------------------------

const listingsStore = new Map<string, Product[]>();

function cloneProduct(product: Product): Product {
  return {
    ...product,
    occasionIds: [...product.occasionIds],
    dietary: [...product.dietary],
    images: product.images.map((image) => ({ ...image })),
    weightOptions: product.weightOptions.map((option) => ({ ...option })),
    tags: [...product.tags],
  };
}

function ensureListings(vendorId: string): Product[] {
  if (!listingsStore.has(vendorId)) {
    listingsStore.set(
      vendorId,
      seedProducts.filter((p) => p.vendorId === vendorId).map(cloneProduct),
    );
  }
  return listingsStore.get(vendorId)!;
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export async function getSellerListings(vendorId: string): Promise<Product[]> {
  if (isMockMode()) return ensureListings(vendorId);
  const listings = await http.get<Product[]>("/seller/listings");
  await warmMyProductIds(vendorId, listings);
  return listings;
}

export async function getSellerListing(
  vendorId: string,
  productId: string,
): Promise<Product | undefined> {
  if (isMockMode()) return ensureListings(vendorId).find((p) => p.id === productId);
  try {
    return await http.get<Product>(`/seller/listings/${encodeURIComponent(productId)}`);
  } catch {
    return undefined;
  }
}

export interface SellerListingInput {
  name: string;
  categoryId: string;
  occasionIds: string[];
  dietary: DietaryTag[];
  description: string;
  isPackaged: boolean;
  cashbackPct: number;
  tags: ProductTag[];
  /** Real project asset path (e.g. "/images/products/mango-thokku-pickle.jpg") — no upload backend, so this is a typed-in path; blank keeps the `<ImageSlot>` placeholder. */
  imagePath?: string;
  weightOptions: WeightOption[];
  defaultWeightSku: string;
}

export async function createSellerListing(
  vendorId: string,
  input: SellerListingInput,
): Promise<Product> {
  if (isMockMode()) {
    const listings = ensureListings(vendorId);
    const id = `pr-seller-${Date.now()}`;
    const product: Product = {
      id,
      slug: `${slugify(input.name)}-${id.slice(-5)}`,
      vendorId,
      name: input.name,
      categoryId: input.categoryId,
      occasionIds: input.occasionIds,
      dietary: input.dietary,
      images: [
        {
          placeholder: `${input.name} product photo`,
          src: input.imagePath || undefined,
          ratio: "1/1",
        },
      ],
      weightOptions: input.weightOptions,
      defaultWeightSku: input.defaultWeightSku || input.weightOptions[0]?.sku || "",
      rating: 0,
      reviewCount: 0,
      tags: input.tags,
      isPackaged: input.isPackaged,
      cashbackPct: input.cashbackPct,
      description: input.description,
    };
    listings.push(product);
    return product;
  }

  return http.post<Product>("/seller/listings", input);
}

export async function updateSellerListing(
  vendorId: string,
  productId: string,
  input: SellerListingInput,
): Promise<Product | undefined> {
  if (isMockMode()) {
    const listings = ensureListings(vendorId);
    const product = listings.find((p) => p.id === productId);
    if (!product) return undefined;

    product.name = input.name;
    product.categoryId = input.categoryId;
    product.occasionIds = input.occasionIds;
    product.dietary = input.dietary;
    product.description = input.description;
    product.isPackaged = input.isPackaged;
    product.cashbackPct = input.cashbackPct;
    product.tags = input.tags;
    product.weightOptions = input.weightOptions;
    product.defaultWeightSku = input.defaultWeightSku || input.weightOptions[0]?.sku || "";
    const firstImage = product.images[0];
    product.images[0] = {
      placeholder: firstImage?.placeholder ?? `${input.name} product photo`,
      src: input.imagePath || undefined,
      ratio: firstImage?.ratio ?? "1/1",
    };

    return product;
  }

  try {
    return await http.patch<Product>(`/seller/listings/${encodeURIComponent(productId)}`, input);
  } catch {
    return undefined;
  }
}

export async function deleteSellerListing(vendorId: string, productId: string): Promise<void> {
  if (isMockMode()) {
    const listings = ensureListings(vendorId);
    const index = listings.findIndex((p) => p.id === productId);
    if (index >= 0) listings.splice(index, 1);
    return;
  }
  await http.delete<void>(`/seller/listings/${encodeURIComponent(productId)}`);
}

// ---------------------------------------------------------------------------
// Orders — mock mode filters the shared seed + live order lists by whether
// any line item's product belongs to this vendor (see `orderIncludesVendor`).
// Real mode: `GET/POST /seller/orders*` (`SellerOrdersService`), already
// scoped server-side to "orders containing >=1 of my items".
// ---------------------------------------------------------------------------

function orderIncludesVendor(order: Order, vendorId: string): boolean {
  return order.items.some((item) => {
    if (!item.productId) return false;
    const product = getProductByIdData(item.productId);
    return product?.vendorId === vendorId;
  });
}

/**
 * `describeSellerOrderItems` (below) needs to know which of a mixed-vendor
 * order's lines are *this* vendor's own — mock mode resolves that via
 * `lib/data`'s product table (`orderIncludesVendor`/`getProductByIdData`),
 * which only knows mock seed ids and can never match a real order's
 * Postgres-generated `productId`s. Real mode instead warms this small
 * per-vendor id cache every time `getSellerListings`/`getSellerOrders` runs
 * (both already fetch "my products" or are called right after a listings
 * fetch in every screen that also renders order descriptions) — best-effort:
 * if the cache isn't warm yet the first time `describeSellerOrderItems` runs,
 * it falls back to describing every line rather than a false "—".
 */
const myProductIdsCache = new Map<string, Set<string>>();

async function warmMyProductIds(vendorId: string, listings?: Product[]): Promise<void> {
  try {
    const list = listings ?? (await http.get<Product[]>("/seller/listings"));
    myProductIdsCache.set(vendorId, new Set(list.map((p) => p.id)));
  } catch {
    // best-effort only — see doc comment above
  }
}

export async function getSellerOrders(vendorId: string): Promise<Order[]> {
  if (isMockMode()) {
    const placed = await getPlacedOrders();
    return [...seedOrders, ...placed]
      .filter((order) => orderIncludesVendor(order, vendorId))
      .sort((a, b) => new Date(b.placedAt).getTime() - new Date(a.placedAt).getTime());
  }

  const [orders] = await Promise.all([
    http.get<Order[]>("/seller/orders"),
    myProductIdsCache.has(vendorId) ? Promise.resolve() : warmMyProductIds(vendorId),
  ]);
  return orders;
}

export async function getSellerOrder(
  vendorId: string,
  orderId: string,
): Promise<Order | undefined> {
  if (isMockMode()) {
    const orders = await getSellerOrders(vendorId);
    return orders.find((o) => o.id === orderId);
  }
  try {
    return await http.get<Order>(`/seller/orders/${encodeURIComponent(orderId)}`);
  } catch {
    return undefined;
  }
}

/**
 * The fulfilment pipeline a seller can advance through — the brief's
 * "placed → packed → shipped → delivered", with `confirmed` kept in the
 * middle since it's a real `OrderStatus` value some seed orders already
 * sit in. `cancelled`/`returned` are terminal and never advance.
 */
export const FULFILLMENT_SEQUENCE: OrderStatus[] = [
  "placed",
  "confirmed",
  "packed",
  "shipped",
  "delivered",
];

export function nextFulfillmentStatus(status: OrderStatus): OrderStatus | undefined {
  const index = FULFILLMENT_SEQUENCE.indexOf(status);
  if (index === -1 || index === FULFILLMENT_SEQUENCE.length - 1) return undefined;
  return FULFILLMENT_SEQUENCE[index + 1];
}

export async function advanceSellerOrderStatus(orderId: string): Promise<Order | undefined> {
  if (isMockMode()) {
    const placed = await getPlacedOrders();
    const order = [...seedOrders, ...placed].find((o) => o.id === orderId);
    if (!order) return undefined;
    const next = nextFulfillmentStatus(order.status);
    if (next) order.status = next;
    return order;
  }

  return http.post<Order>(`/seller/orders/${encodeURIComponent(orderId)}/advance`);
}

/**
 * "Mango Thokku Pickle ×2, Ragi Almond Cookies ×1" — this seller's line
 * items only, for the order-list rows. A mixed-vendor order can have items
 * outside this seller's catalog; those are left out on purpose (mock mode)
 * or best-effort filtered via `myProductIdsCache` (real mode — see that
 * cache's doc comment).
 */
export function describeSellerOrderItems(order: Order, vendorId: string): string {
  if (isMockMode()) {
    const own = order.items.filter((item) => {
      if (!item.productId) return false;
      return getProductByIdData(item.productId)?.vendorId === vendorId;
    });
    if (own.length === 0) return "—";
    return own.map((item) => `${item.name} ×${item.quantity}`).join(", ");
  }

  const myIds = myProductIdsCache.get(vendorId);
  const relevant = myIds
    ? order.items.filter((item) => item.productId && myIds.has(item.productId))
    : order.items;
  if (relevant.length === 0) return "—";
  return relevant.map((item) => `${item.name} ×${item.quantity}`).join(", ");
}

// ---------------------------------------------------------------------------
// Dashboard snapshot
// ---------------------------------------------------------------------------

/**
 * The one dashboard snapshot, matching `SellerService.getDashboard` on the
 * server. Covers all three revenue streams a HomeKrafter can have; the ones
 * they don't use come back as zeroes rather than being absent, so the UI
 * never has to branch on account type.
 */
export interface SellerDashboardSnapshot {
  todayOrdersCount: number;
  todayRevenue: number;
  pendingPayoutAmount: number;
  lowStockCount: number;
  rating: number;
  reviewCount: number;
  /** Storefront items, and how many are switched on right now. */
  listingsCount?: number;
  activeListingsCount?: number;
  /** Laundry/pickup counters — zero for a HomeKrafter who doesn't do them. */
  todayPickupsCount?: number;
  todayDeliveriesCount?: number;
  weekEarnings?: number;
  /** WhatsApp snack-order counters. */
  incomingOrdersCount?: number;
  menuSize?: number;
  snackEarnings?: number;
}

/**
 * `PATCH /seller/listings/:id/availability` — the HomeKrafter's own
 * "am I making this today" switch. Returns the updated product.
 */
export async function setListingAvailability(
  vendorId: string,
  productId: string,
  isAvailable: boolean,
): Promise<Product> {
  if (!isMockMode()) {
    return http.patch<Product>(`/seller/listings/${encodeURIComponent(productId)}/availability`, {
      isAvailable,
    });
  }
  const product = ensureListings(vendorId).find((p) => p.id === productId);
  if (!product) throw new Error("Listing not found");
  product.isAvailable = isAvailable;
  return product;
}

/** `PATCH /seller/menu/:id/availability` — same switch over a `Snack`. */
export async function setMenuItemAvailability(
  sellerId: string,
  snackId: string,
  isAvailable: boolean,
): Promise<Snack> {
  if (!isMockMode()) {
    return http.patch<Snack>(`/seller/menu/${encodeURIComponent(snackId)}/availability`, {
      isAvailable,
    });
  }
  const snack = ensureMenu(sellerId).find((x) => x.id === snackId);
  if (!snack) throw new Error("Menu item not found");
  snack.available = isAvailable;
  return snack;
}

/** Any weight-tier SKU under this stock count counts toward the dashboard's "low stock" tile. */
const LOW_STOCK_THRESHOLD = 15;

export async function getSellerDashboard(seller: Seller): Promise<SellerDashboardSnapshot> {
  if (!isMockMode()) return http.get<SellerDashboardSnapshot>("/seller/dashboard");

  const vendorId = seller.vendorId;
  const [orders, listings, payoutList, vendor] = await Promise.all([
    vendorId ? getSellerOrders(vendorId) : Promise.resolve<Order[]>([]),
    vendorId ? getSellerListings(vendorId) : Promise.resolve<Product[]>([]),
    getSellerPayouts(seller.id),
    vendorId ? getSellerVendor(vendorId) : Promise.resolve<Vendor | undefined>(undefined),
  ]);

  const today = new Date().toISOString().slice(0, 10);
  const todayOrders = orders.filter((o) => o.placedAt.slice(0, 10) === today);
  const lowStockCount = listings.reduce(
    (count, product) =>
      count + product.weightOptions.filter((w) => w.stock < LOW_STOCK_THRESHOLD).length,
    0,
  );

  return {
    todayOrdersCount: todayOrders.length,
    todayRevenue: todayOrders.reduce((sum, o) => sum + o.total, 0),
    pendingPayoutAmount: payoutList
      .filter((p) => p.status === "pending")
      .reduce((sum, p) => sum + p.amount, 0),
    lowStockCount,
    rating: vendor?.rating ?? 0,
    reviewCount: vendor?.reviewCount ?? 0,
  };
}

// ---------------------------------------------------------------------------
// Payouts — real mode: `GET /seller/payouts` returns `{items, summary,
// pendingBalance}` in one call; `getSellerPayouts`/`getSellerEarningsSummary`
// each hit it independently (accepted redundancy — same pattern as
// `lib/api/products.ts#getProductById` re-fetching the full catalog).
// ---------------------------------------------------------------------------

/** Live "requested payout" table, separate from the seed history — same split as `lib/api/orders.ts`'s `orders` vs. `lib/data/orders.ts#seedOrders` (mock mode only). */
const livePayouts: Payout[] = [];

interface SellerPayoutsPage {
  items: Payout[];
  summary: SellerEarningsSummary;
  pendingBalance: number;
}

export async function getSellerPayouts(sellerId: string): Promise<Payout[]> {
  if (isMockMode()) {
    return [...seedPayouts, ...livePayouts]
      .filter((p) => p.sellerId === sellerId)
      .sort((a, b) => new Date(b.periodEnd).getTime() - new Date(a.periodEnd).getTime());
  }
  const page = await http.get<SellerPayoutsPage>("/seller/payouts");
  return page.items;
}

export interface SellerEarningsSummary {
  totalPaid: number;
  totalPending: number;
  lifetimeEarned: number;
}

export async function getSellerEarningsSummary(sellerId: string): Promise<SellerEarningsSummary> {
  if (isMockMode()) {
    const list = await getSellerPayouts(sellerId);
    const totalPaid = list.filter((p) => p.status === "paid").reduce((sum, p) => sum + p.amount, 0);
    const totalPending = list
      .filter((p) => p.status === "pending")
      .reduce((sum, p) => sum + p.amount, 0);
    return { totalPaid, totalPending, lifetimeEarned: totalPaid + totalPending };
  }
  const page = await http.get<SellerPayoutsPage>("/seller/payouts");
  return page.summary;
}

/**
 * Real mode: **shape change** — no `amount` param anymore
 * (`docs/API.md`: "the real endpoint computes it server-side, never trust
 * a client-submitted payout amount"). Kept on the signature only so the
 * call site (`SellerPayoutsClient`) doesn't need to change; ignored.
 */
export async function requestSellerPayout(sellerId: string, amount: number): Promise<Payout> {
  if (isMockMode()) {
    const today = new Date().toISOString().slice(0, 10);
    const payout: Payout = {
      id: `po-${Date.now()}`,
      sellerId,
      amount,
      periodStart: today,
      periodEnd: today,
      status: "pending",
    };
    livePayouts.push(payout);
    return payout;
  }

  return http.post<Payout>("/seller/payouts/request");
}

// ---------------------------------------------------------------------------
// Reviews — read + reply
// ---------------------------------------------------------------------------

export async function getSellerReviews(vendorId: string): Promise<Review[]> {
  if (isMockMode()) {
    const listings = await getSellerListings(vendorId);
    const productIds = new Set(listings.map((p) => p.id));
    return allReviews
      .filter(
        (review) =>
          (review.targetType === "vendor" && review.targetId === vendorId) ||
          (review.targetType === "product" && productIds.has(review.targetId)),
      )
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }
  return http.get<Review[]>("/seller/reviews");
}

export async function replySellerReview(reviewId: string, body: string): Promise<Review | undefined> {
  if (isMockMode()) {
    const review = allReviews.find((r) => r.id === reviewId);
    if (!review) return undefined;
    review.sellerReply = { body, createdAt: new Date().toISOString() };
    return review;
  }
  try {
    return await http.post<Review>(`/seller/reviews/${encodeURIComponent(reviewId)}/reply`, { body });
  } catch {
    return undefined;
  }
}

// ---------------------------------------------------------------------------
// Storefront edit — mock mode mutates the shared `Vendor` record in place
// (see the long-standing doc comment on the client/server module-graph
// caveat this never fixed until now). Real mode: `PATCH /seller/storefront`
// writes the actual DB row every render (including the server-rendered
// `/storefront/[vendor]` page) reads from — a real fix, not just documented
// as one (`docs/API.md`'s `updateSellerStorefront` entry).
// ---------------------------------------------------------------------------

export interface SellerStorefrontInput {
  bio: string;
  location: string;
  avatarSrc?: string;
  bannerSrc?: string;
}

export async function updateSellerStorefront(
  vendorId: string,
  input: SellerStorefrontInput,
): Promise<Vendor | undefined> {
  if (isMockMode()) {
    const vendor = getVendorByIdData(vendorId);
    if (!vendor) return undefined;
    vendor.bio = input.bio;
    vendor.location = input.location;
    vendor.avatarSrc = input.avatarSrc || undefined;
    vendor.bannerSrc = input.bannerSrc || undefined;
    return vendor;
  }

  try {
    return await http.patch<Vendor>("/seller/storefront", input);
  } catch {
    return undefined;
  }
}

// ---------------------------------------------------------------------------
// HomeKrafter profile (M16) — `/seller/profile`
//
// Separate from the storefront edit above, which stays what it always was:
// the four catalogue-facing fields (bio, location, avatar, banner) that
// ride on every product card. This is the page a buyer reads *before*
// deciding to trust a kitchen — story, hours, policies, hygiene, licence.
//
// Note the absent verification fields. `fssaiVerified`/`identityVerified`/
// `addressVerified` are the badge, and a seller setting their own badge
// would make it worthless — they are admin-only
// (`PATCH /admin/sellers/:id/verification`). A HomeKrafter submits
// `fssaiNumber`; changing it clears any existing verification, server-side.
// ---------------------------------------------------------------------------

export interface SellerProfileInput {
  tagline?: string;
  story?: string;
  knownFor?: string[];
  languages?: string[];
  prepTimeMins?: number;
  responseTimeMins?: number;
  capacityPerDay?: number;
  minOrderValue?: number;
  workingDays?: number[];
  opensAt?: string;
  closesAt?: string;
  cancellationPolicy?: string;
  returnPolicy?: string;
  customOrderPolicy?: string;
  acceptsCustomOrders?: boolean;
  packagingNote?: string;
  hygieneNote?: string;
  fssaiNumber?: string;
  instagramUrl?: string;
  facebookUrl?: string;
  youtubeUrl?: string;
  websiteUrl?: string;
}

export async function getSellerProfile(vendorSlug?: string): Promise<OwnVendorProfile | undefined> {
  if (isMockMode()) return getOwnVendorProfile(vendorSlug ?? "anjalis-kitchen");
  try {
    return await http.get<OwnVendorProfile>("/seller/profile");
  } catch {
    return undefined;
  }
}

export async function updateSellerProfile(
  input: SellerProfileInput,
  vendorSlug?: string,
): Promise<OwnVendorProfile | undefined> {
  if (isMockMode()) return getOwnVendorProfile(vendorSlug ?? "anjalis-kitchen");
  try {
    return await http.patch<OwnVendorProfile>("/seller/profile", input);
  } catch {
    return undefined;
  }
}

export async function addSellerPhoto(input: {
  url: string;
  caption?: string;
  kind?: VendorPhotoKind;
}): Promise<VendorPhoto | undefined> {
  if (isMockMode()) {
    return { id: `vp-${Date.now()}`, url: input.url, caption: input.caption, kind: input.kind ?? "kitchen", sortOrder: 0 };
  }
  try {
    return await http.post<VendorPhoto>("/seller/profile/photos", input);
  } catch {
    return undefined;
  }
}

export async function removeSellerPhoto(photoId: string): Promise<VendorPhoto[] | undefined> {
  if (isMockMode()) return [];
  try {
    return await http.delete<VendorPhoto[]>(`/seller/profile/photos/${encodeURIComponent(photoId)}`);
  } catch {
    return undefined;
  }
}

function todayISODate(): string {
  return new Date().toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// M10b — Laundry partner: pickups (`LaundryBooking`s assigned via
// `partnerId`), dashboard snapshot. Real mode: `GET/POST /seller/bookings*`
// (`SellerBookingsService`).
// ---------------------------------------------------------------------------

export async function getPartnerBookings(partnerId: string): Promise<LaundryBooking[]> {
  if (isMockMode()) {
    const placed = await getPlacedBookings();
    return [...seedLaundryBookings, ...placed]
      .filter((b) => b.partnerId === partnerId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }
  return http.get<LaundryBooking[]>("/seller/bookings");
}

export async function getPartnerBooking(
  partnerId: string,
  bookingId: string,
): Promise<LaundryBooking | undefined> {
  if (isMockMode()) {
    const bookings = await getPartnerBookings(partnerId);
    return bookings.find((b) => b.id === bookingId);
  }
  try {
    return await http.get<LaundryBooking>(`/seller/bookings/${encodeURIComponent(bookingId)}`);
  } catch {
    return undefined;
  }
}

/** The pipeline a partner can advance a booking through — mirrors the brief's "booked→picked-up→processing→out-for-delivery→delivered" against the real `LaundryBookingStatus` union's naming (`scheduled`/`in-progress`). `cancelled` is terminal and never advances. */
export const BOOKING_SEQUENCE: LaundryBookingStatus[] = [
  "scheduled",
  "picked-up",
  "in-progress",
  "out-for-delivery",
  "delivered",
];

export function nextBookingStatus(status: LaundryBookingStatus): LaundryBookingStatus | undefined {
  const index = BOOKING_SEQUENCE.indexOf(status);
  if (index === -1 || index === BOOKING_SEQUENCE.length - 1) return undefined;
  return BOOKING_SEQUENCE[index + 1];
}

export async function advancePartnerBookingStatus(
  bookingId: string,
): Promise<LaundryBooking | undefined> {
  if (isMockMode()) {
    const placed = await getPlacedBookings();
    const booking = [...seedLaundryBookings, ...placed].find((b) => b.id === bookingId);
    if (!booking) return undefined;
    const next = nextBookingStatus(booking.status);
    if (next) booking.status = next;
    return booking;
  }

  return http.post<LaundryBooking>(`/seller/bookings/${encodeURIComponent(bookingId)}/advance`);
}

export interface PartnerSlotInput {
  pickupSlot: { date: string; slotId: string };
  deliverySlot: { date: string; slotId: string };
}

/**
 * **Stays mock-only in every mode** — `docs/API.md`: "Not built in
 * M8.3b (not in the brief's scope) — still mock-only." In real mode this
 * mutates a mock-only booking object that isn't the one `getPartnerBooking`
 * just fetched from the server, so "Save slots" appears to succeed but the
 * next reload shows the original server-side slots — flagged here rather
 * than silently letting it look like a real write. A future milestone needs
 * a real `PATCH /seller/bookings/:id/slots` endpoint.
 */
export async function updatePartnerBookingSlots(
  bookingId: string,
  input: PartnerSlotInput,
): Promise<LaundryBooking | undefined> {
  const placed = await getPlacedBookings();
  const booking = [...seedLaundryBookings, ...placed].find((b) => b.id === bookingId);
  if (!booking) return undefined;
  booking.pickupSlot = input.pickupSlot;
  booking.deliverySlot = input.deliverySlot;
  return booking;
}

export interface PartnerDashboardSnapshot {
  todayPickupsCount: number;
  todayDeliveriesCount: number;
  weekEarnings: number;
  pendingPayoutAmount: number;
  rating: number;
  reviewCount: number;
}

/** Bookings whose `createdAt` falls within the trailing 7 days count toward "this week's earnings" — a simple mock proxy for a real settlement-period calculation. */
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export async function getPartnerDashboard(seller: Seller): Promise<PartnerDashboardSnapshot> {
  if (!isMockMode()) return http.get<PartnerDashboardSnapshot>("/seller/dashboard");

  const [bookings, payoutList] = await Promise.all([
    getPartnerBookings(seller.id),
    getSellerPayouts(seller.id),
  ]);

  const today = todayISODate();
  const now = Date.now();
  const todayPickupsCount = bookings.filter((b) => b.pickupSlot.date === today).length;
  const todayDeliveriesCount = bookings.filter((b) => b.deliverySlot.date === today).length;
  const weekEarnings = bookings
    .filter((b) => b.status !== "cancelled" && now - new Date(b.createdAt).getTime() <= WEEK_MS)
    .reduce((sum, b) => sum + b.estimatedTotal, 0);

  return {
    todayPickupsCount,
    todayDeliveriesCount,
    weekEarnings,
    pendingPayoutAmount: payoutList
      .filter((p) => p.status === "pending")
      .reduce((sum, p) => sum + p.amount, 0),
    rating: seller.rating ?? 0,
    reviewCount: seller.reviewCount ?? 0,
  };
}

// ---------------------------------------------------------------------------
// M10b — Snack seller: menu CRUD (`Snack`s scoped by `sellerId`). Real
// mode: `GET/POST/PATCH/DELETE /seller/menu*` (`SellerMenuService`).
// ---------------------------------------------------------------------------

const menuStore = new Map<string, Snack[]>();

function cloneSnack(snack: Snack): Snack {
  return { ...snack };
}

function ensureMenu(sellerId: string): Snack[] {
  if (!menuStore.has(sellerId)) {
    menuStore.set(
      sellerId,
      seedSnacks.filter((s) => s.sellerId === sellerId).map(cloneSnack),
    );
  }
  return menuStore.get(sellerId)!;
}

function slugifySnack(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export async function getSellerMenu(sellerId: string): Promise<Snack[]> {
  if (isMockMode()) return ensureMenu(sellerId);
  return http.get<Snack[]>("/seller/menu");
}

export async function getSellerMenuItem(
  sellerId: string,
  snackId: string,
): Promise<Snack | undefined> {
  if (isMockMode()) return ensureMenu(sellerId).find((s) => s.id === snackId);
  try {
    return await http.get<Snack>(`/seller/menu/${encodeURIComponent(snackId)}`);
  } catch {
    return undefined;
  }
}

export interface SellerMenuInput {
  name: string;
  description: string;
  price: number;
  category: SnackCategory;
  diet: DietType;
  /** Real project asset path (e.g. "/images/snacks/your-snack.jpg") — same no-upload-yet convention as `SellerListingInput.imagePath`; blank keeps the `<ImageSlot>` placeholder. */
  imagePath?: string;
  available: boolean;
}

export async function createSellerMenuItem(
  sellerId: string,
  input: SellerMenuInput,
): Promise<Snack> {
  if (isMockMode()) {
    const menu = ensureMenu(sellerId);
    const id = `sk-seller-${Date.now()}`;
    const snack: Snack = {
      id,
      slug: `${slugifySnack(input.name)}-${id.slice(-5)}`,
      name: input.name,
      description: input.description,
      price: input.price,
      category: input.category,
      diet: input.diet,
      imagePlaceholder: `${input.name} photo`,
      imageSrc: input.imagePath || undefined,
      available: input.available,
      sellerId,
    };
    menu.push(snack);
    return snack;
  }

  return http.post<Snack>("/seller/menu", input);
}

export async function updateSellerMenuItem(
  sellerId: string,
  snackId: string,
  input: SellerMenuInput,
): Promise<Snack | undefined> {
  if (isMockMode()) {
    const menu = ensureMenu(sellerId);
    const snack = menu.find((s) => s.id === snackId);
    if (!snack) return undefined;

    snack.name = input.name;
    snack.description = input.description;
    snack.price = input.price;
    snack.category = input.category;
    snack.diet = input.diet;
    snack.imageSrc = input.imagePath || undefined;
    snack.available = input.available;

    return snack;
  }

  try {
    return await http.patch<Snack>(`/seller/menu/${encodeURIComponent(snackId)}`, input);
  } catch {
    return undefined;
  }
}

export async function deleteSellerMenuItem(sellerId: string, snackId: string): Promise<void> {
  if (isMockMode()) {
    const menu = ensureMenu(sellerId);
    const index = menu.findIndex((s) => s.id === snackId);
    if (index >= 0) menu.splice(index, 1);
    return;
  }
  await http.delete<void>(`/seller/menu/${encodeURIComponent(snackId)}`);
}

// ---------------------------------------------------------------------------
// M10b — Snack seller: incoming WhatsApp-origin orders (`SnackOrder`, see
// its doc comment in `lib/types/food.ts` for why this exists as a
// seller-side mock entity rather than a real consumer-placed order). Real
// mode: `GET/POST /seller/snack-orders*` (`SellerSnackOrdersService`).
// ---------------------------------------------------------------------------

const liveSnackOrders: SnackOrder[] = [];

export async function getSnackOrders(sellerId: string): Promise<SnackOrder[]> {
  if (isMockMode()) {
    return [...seedSnackOrders, ...liveSnackOrders]
      .filter((o) => o.sellerId === sellerId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }
  return http.get<SnackOrder[]>("/seller/snack-orders");
}

/**
 * M11a — unscoped, admin-only: every `SnackOrder` across every snack
 * seller, not just one caller's own (`getSnackOrders` above stays scoped
 * to the seller portal). **Mock-only** — the real unscoped read is
 * `lib/api/admin.ts#getAllOrdersUnified`'s own real branch (`GET
 * /admin/orders`), which no longer calls this function at all; only
 * `admin.ts`'s *mock* branch still does, the same way it reads
 * `seedOrders`/`getPlacedOrders` from the marketplace side.
 */
export async function getAllSnackOrders(): Promise<SnackOrder[]> {
  return [...seedSnackOrders, ...liveSnackOrders];
}

export async function getSnackOrder(
  sellerId: string,
  orderId: string,
): Promise<SnackOrder | undefined> {
  if (isMockMode()) {
    const orders = await getSnackOrders(sellerId);
    return orders.find((o) => o.id === orderId);
  }
  try {
    return await http.get<SnackOrder>(`/seller/snack-orders/${encodeURIComponent(orderId)}`);
  } catch {
    return undefined;
  }
}

/** Mirrors the exact WhatsApp status timeline the consumer sees on `/snacks` (`SnackListStatus`'s WA states) — see `SnackOrder`'s doc comment. */
export const SNACK_ORDER_SEQUENCE: SnackOrderStatus[] = [
  "received",
  "accepted",
  "out-for-delivery",
  "delivered",
];

export function nextSnackOrderStatus(status: SnackOrderStatus): SnackOrderStatus | undefined {
  const index = SNACK_ORDER_SEQUENCE.indexOf(status);
  if (index === -1 || index === SNACK_ORDER_SEQUENCE.length - 1) return undefined;
  return SNACK_ORDER_SEQUENCE[index + 1];
}

export async function advanceSnackOrderStatus(orderId: string): Promise<SnackOrder | undefined> {
  if (isMockMode()) {
    const order = [...seedSnackOrders, ...liveSnackOrders].find((o) => o.id === orderId);
    if (!order) return undefined;
    const next = nextSnackOrderStatus(order.status);
    if (next) order.status = next;
    return order;
  }

  return http.post<SnackOrder>(`/seller/snack-orders/${encodeURIComponent(orderId)}/advance`);
}

export interface SnackDashboardSnapshot {
  incomingOrdersCount: number;
  menuSize: number;
  earnings: number;
  pendingPayoutAmount: number;
}

export async function getSnackDashboard(seller: Seller): Promise<SnackDashboardSnapshot> {
  if (!isMockMode()) return http.get<SnackDashboardSnapshot>("/seller/dashboard");

  const [orders, menu, payoutList] = await Promise.all([
    getSnackOrders(seller.id),
    getSellerMenu(seller.id),
    getSellerPayouts(seller.id),
  ]);

  return {
    incomingOrdersCount: orders.filter((o) => o.status === "received").length,
    menuSize: menu.length,
    earnings: orders
      .filter((o) => o.status === "delivered")
      .reduce((sum, o) => sum + o.total, 0),
    pendingPayoutAmount: payoutList
      .filter((p) => p.status === "pending")
      .reduce((sum, p) => sum + p.amount, 0),
  };
}
