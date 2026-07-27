/**
 * Seller-scoped mock API (M10a) — every function here takes the caller's
 * own `vendorId`/`sellerId` as an argument and only ever reads/writes
 * data under it. There is no server yet to enforce that scoping for
 * real: today it's just "the function only queries what you passed in,"
 * trusted because the caller is always `SellerShell`/its screens reading
 * `useAuth().seller` (the signed-in seller). **M8 must re-derive
 * `vendorId`/`sellerId` from the verified server session instead of
 * trusting a client-passed id** — that's the one thing every function
 * below leaves for the real backend to harden.
 *
 * Listings/orders/payouts/reviews/storefront edits all mutate module-level
 * arrays in place (either a lazily-seeded copy here, or — for orders and
 * the vendor record — the shared `lib/data` objects directly, the same
 * "session-scoped mock write" pattern `lib/api/orders.ts#createOrder` and
 * `lib/api/sell.ts#createSellerApplication` already use). Everything
 * resets on a hard reload; that's expected until M8's Postgres tables land.
 */

import {
  getProductById as getProductByIdData,
  getVendorById as getVendorByIdData,
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
  Vendor,
  WeightOption,
} from "@/lib/types";
import { getPlacedBookings } from "./laundry";
import { getPlacedOrders } from "./orders";

// ---------------------------------------------------------------------------
// Seller / vendor lookups
// ---------------------------------------------------------------------------

export async function getSeller(sellerId: string): Promise<Seller | undefined> {
  return sellers.find((s) => s.id === sellerId);
}

export async function getSellerVendor(vendorId: string): Promise<Vendor | undefined> {
  return getVendorByIdData(vendorId);
}

// ---------------------------------------------------------------------------
// Listings (maker) — CRUD over a lazily-seeded per-vendor copy of
// `lib/data/products`. Kept separate from the shared `products` array so a
// seller deleting/editing a demo listing can never destabilise the
// consumer catalog (Shop/Home/Storefront all read the untouched original).
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
  return ensureListings(vendorId);
}

export async function getSellerListing(
  vendorId: string,
  productId: string,
): Promise<Product | undefined> {
  return ensureListings(vendorId).find((p) => p.id === productId);
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

export async function updateSellerListing(
  vendorId: string,
  productId: string,
  input: SellerListingInput,
): Promise<Product | undefined> {
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

export async function deleteSellerListing(vendorId: string, productId: string): Promise<void> {
  const listings = ensureListings(vendorId);
  const index = listings.findIndex((p) => p.id === productId);
  if (index >= 0) listings.splice(index, 1);
}

// ---------------------------------------------------------------------------
// Orders — filtered from the shared seed + live order lists by whether any
// line item's product belongs to this vendor. Status advances mutate the
// shared `Order` object in place — the exact object `/account/orders`'s
// `OrderDetailClient` (also a client component) reads, so within the same
// browser tab and without a hard reload, a status change made here is
// visible there too on the next client-side navigation. That's a real
// limit, not just phrasing: both sides are plain `"use client"` modules
// mutating in-memory state, so this only holds within one tab's live JS —
// a hard reload (or any fresh request to a *server*-rendered page, e.g.
// `/storefront/[vendor]`, see `updateSellerStorefront` below) re-runs
// module top-level code from scratch and loses it, same caveat every
// other mock mutation in this codebase already carries
// (`lib/api/orders.ts#createOrder`, `lib/api/sell.ts#createSellerApplication`).
// Real cross-surface consistency is exactly what M8's shared Postgres
// tables replace this with.
// ---------------------------------------------------------------------------

function orderIncludesVendor(order: Order, vendorId: string): boolean {
  return order.items.some((item) => {
    if (!item.productId) return false;
    const product = getProductByIdData(item.productId);
    return product?.vendorId === vendorId;
  });
}

export async function getSellerOrders(vendorId: string): Promise<Order[]> {
  const placed = await getPlacedOrders();
  return [...seedOrders, ...placed]
    .filter((order) => orderIncludesVendor(order, vendorId))
    .sort((a, b) => new Date(b.placedAt).getTime() - new Date(a.placedAt).getTime());
}

export async function getSellerOrder(
  vendorId: string,
  orderId: string,
): Promise<Order | undefined> {
  const orders = await getSellerOrders(vendorId);
  return orders.find((o) => o.id === orderId);
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
  const placed = await getPlacedOrders();
  const order = [...seedOrders, ...placed].find((o) => o.id === orderId);
  if (!order) return undefined;
  const next = nextFulfillmentStatus(order.status);
  if (next) order.status = next;
  return order;
}

/** "Mango Thokku Pickle ×2, Ragi Almond Cookies ×1" — this seller's line items only, for the order-list rows. A mixed-vendor order can have items outside this seller's catalog; those are left out on purpose. */
export function describeSellerOrderItems(order: Order, vendorId: string): string {
  const own = order.items.filter((item) => {
    if (!item.productId) return false;
    return getProductByIdData(item.productId)?.vendorId === vendorId;
  });
  if (own.length === 0) return "—";
  return own.map((item) => `${item.name} ×${item.quantity}`).join(", ");
}

// ---------------------------------------------------------------------------
// Dashboard snapshot
// ---------------------------------------------------------------------------

export interface SellerDashboardSnapshot {
  todayOrdersCount: number;
  todayRevenue: number;
  pendingPayoutAmount: number;
  lowStockCount: number;
  rating: number;
  reviewCount: number;
}

/** Any weight-tier SKU under this stock count counts toward the dashboard's "low stock" tile. */
const LOW_STOCK_THRESHOLD = 15;

export async function getSellerDashboard(seller: Seller): Promise<SellerDashboardSnapshot> {
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
// Payouts
// ---------------------------------------------------------------------------

/** Live "requested payout" table, separate from the seed history — same split as `lib/api/orders.ts`'s `orders` vs. `lib/data/orders.ts#seedOrders`. */
const livePayouts: Payout[] = [];

export async function getSellerPayouts(sellerId: string): Promise<Payout[]> {
  return [...seedPayouts, ...livePayouts]
    .filter((p) => p.sellerId === sellerId)
    .sort((a, b) => new Date(b.periodEnd).getTime() - new Date(a.periodEnd).getTime());
}

export interface SellerEarningsSummary {
  totalPaid: number;
  totalPending: number;
  lifetimeEarned: number;
}

export async function getSellerEarningsSummary(sellerId: string): Promise<SellerEarningsSummary> {
  const list = await getSellerPayouts(sellerId);
  const totalPaid = list.filter((p) => p.status === "paid").reduce((sum, p) => sum + p.amount, 0);
  const totalPending = list
    .filter((p) => p.status === "pending")
    .reduce((sum, p) => sum + p.amount, 0);
  return { totalPaid, totalPending, lifetimeEarned: totalPaid + totalPending };
}

export async function requestSellerPayout(sellerId: string, amount: number): Promise<Payout> {
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

// ---------------------------------------------------------------------------
// Reviews — read + reply
// ---------------------------------------------------------------------------

export async function getSellerReviews(vendorId: string): Promise<Review[]> {
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

export async function replySellerReview(reviewId: string, body: string): Promise<Review | undefined> {
  const review = allReviews.find((r) => r.id === reviewId);
  if (!review) return undefined;
  review.sellerReply = { body, createdAt: new Date().toISOString() };
  return review;
}

// ---------------------------------------------------------------------------
// Storefront edit — mutates the shared `Vendor` record in place, the same
// session-scoped-mutation pattern every other function in this file uses.
// **This one does NOT reach the consumer `/storefront/[vendor]` page**,
// unlike the order-status mutation above: that page is a `Vendor`-fetching
// *Server Component* (`app/storefront/[vendor]/page.tsx`), so every visit
// re-runs on the server against the server's own module instance of
// `lib/data/vendors.ts` — a mutation made from this "use client" seller
// screen lives only in the browser bundle's copy and can never reach it.
// Verified live: editing bio here and then hard-navigating to
// `/storefront/anjalis-kitchen` still shows the original seed bio. A real
// fix needs either a Route Handler this mutation POSTs to (server-side
// write) or the M8 database — flagging here rather than leaving the
// stale claim a first version of this comment made.
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
  const vendor = getVendorByIdData(vendorId);
  if (!vendor) return undefined;
  vendor.bio = input.bio;
  vendor.location = input.location;
  vendor.avatarSrc = input.avatarSrc || undefined;
  vendor.bannerSrc = input.bannerSrc || undefined;
  return vendor;
}

function todayISODate(): string {
  return new Date().toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// M10b — Laundry partner: pickups (`LaundryBooking`s assigned via
// `partnerId`), dashboard snapshot. Same session-scoped-mutation pattern
// as the marketplace order section above: seed history +
// `getPlacedBookings()` (live bookings placed this session, see
// `lib/api/laundry.ts`) merged and filtered by `partnerId`, status
// advanced by mutating the shared `LaundryBooking` object in place — a
// change made here is visible to `/account/orders`'s booking detail
// within the same tab, same caveat as the marketplace order mutation
// above (lost on hard reload; real cross-surface consistency is M8).
// ---------------------------------------------------------------------------

export async function getPartnerBookings(partnerId: string): Promise<LaundryBooking[]> {
  const placed = await getPlacedBookings();
  return [...seedLaundryBookings, ...placed]
    .filter((b) => b.partnerId === partnerId)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export async function getPartnerBooking(
  partnerId: string,
  bookingId: string,
): Promise<LaundryBooking | undefined> {
  const bookings = await getPartnerBookings(partnerId);
  return bookings.find((b) => b.id === bookingId);
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
  const placed = await getPlacedBookings();
  const booking = [...seedLaundryBookings, ...placed].find((b) => b.id === bookingId);
  if (!booking) return undefined;
  const next = nextBookingStatus(booking.status);
  if (next) booking.status = next;
  return booking;
}

export interface PartnerSlotInput {
  pickupSlot: { date: string; slotId: string };
  deliverySlot: { date: string; slotId: string };
}

/** Lets a partner set/confirm the two scheduling slots from the pickup detail screen — mutates the same shared `LaundryBooking` object `advancePartnerBookingStatus` does. */
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
// M10b — Snack seller: menu CRUD (`Snack`s scoped by `sellerId`), same
// lazily-seeded-per-owner-copy pattern as the maker Listings section
// above — a seller editing/deleting a demo menu item can never affect
// the shared `lib/data/snacks.ts` array the consumer `/snacks` grid
// reads.
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
  return ensureMenu(sellerId);
}

export async function getSellerMenuItem(
  sellerId: string,
  snackId: string,
): Promise<Snack | undefined> {
  return ensureMenu(sellerId).find((s) => s.id === snackId);
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

export async function updateSellerMenuItem(
  sellerId: string,
  snackId: string,
  input: SellerMenuInput,
): Promise<Snack | undefined> {
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

export async function deleteSellerMenuItem(sellerId: string, snackId: string): Promise<void> {
  const menu = ensureMenu(sellerId);
  const index = menu.findIndex((s) => s.id === snackId);
  if (index >= 0) menu.splice(index, 1);
}

// ---------------------------------------------------------------------------
// M10b — Snack seller: incoming WhatsApp-origin orders (`SnackOrder`, see
// its doc comment in `lib/types/food.ts` for why this exists as a
// seller-side mock entity rather than a real consumer-placed order).
// Seed + a live in-memory list, same split as every other mock "table"
// in this codebase.
// ---------------------------------------------------------------------------

const liveSnackOrders: SnackOrder[] = [];

export async function getSnackOrders(sellerId: string): Promise<SnackOrder[]> {
  return [...seedSnackOrders, ...liveSnackOrders]
    .filter((o) => o.sellerId === sellerId)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

/**
 * M11a — unscoped, admin-only: every `SnackOrder` across every snack
 * seller, not just one caller's own (`getSnackOrders` above stays
 * scoped to the seller portal). Lives here rather than in
 * `lib/api/admin.ts` because `liveSnackOrders` is this module's private
 * state — `lib/api/admin.ts#getAllOrdersUnified` calls this the same
 * way it reads `seedOrders`/`getPlacedOrders` from the marketplace side.
 */
export async function getAllSnackOrders(): Promise<SnackOrder[]> {
  return [...seedSnackOrders, ...liveSnackOrders];
}

export async function getSnackOrder(
  sellerId: string,
  orderId: string,
): Promise<SnackOrder | undefined> {
  const orders = await getSnackOrders(sellerId);
  return orders.find((o) => o.id === orderId);
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
  const order = [...seedSnackOrders, ...liveSnackOrders].find((o) => o.id === orderId);
  if (!order) return undefined;
  const next = nextSnackOrderStatus(order.status);
  if (next) order.status = next;
  return order;
}

export interface SnackDashboardSnapshot {
  incomingOrdersCount: number;
  menuSize: number;
  earnings: number;
  pendingPayoutAmount: number;
}

export async function getSnackDashboard(seller: Seller): Promise<SnackDashboardSnapshot> {
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
