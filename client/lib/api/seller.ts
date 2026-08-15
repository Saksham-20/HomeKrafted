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
  ProductKind,
  ProductShippingScope,
  ProductTag,
  Review,
  Seller,
  SellerOrder,
  SellerSpecialty,
  Snack,
  SnackCategory,
  SnackOrder,
  SnackOrderStatus,
  OwnVendorProfile,
  SellerAnalytics,
  Vendor,
  VendorBlackout,
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

/**
 * The signed-in HomeKrafter's own `Seller` record, from the server
 * (`GET /seller/me`, M17).
 *
 * `AuthContext` used to resolve this by looking the session user's id up
 * in the **mock** `lib/data/sellers.ts` list. A real HomeKrafter is not
 * in that list, so the lookup missed and fell back to a demo record —
 * meaning a genuine kitchen saw another kitchen's name and `vendorId`
 * throughout their own portal.
 */
export async function getMySeller(): Promise<Seller | undefined> {
  // Mock parity for the M37 commission block: the real record carries the
  // platform rate so no screen hardcodes one; offline mode models the
  // shipped default (10%, deduction off).
  if (isMockMode()) return { ...sellers[0], commission: { pct: 10, enabled: false } };
  try {
    return await http.get<Seller>("/seller/me");
  } catch {
    return undefined;
  }
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
  return http.get<Product[]>("/seller/listings");
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
  /** Lists it on `/hamper` as a ready-made gift hamper (M18). */
  isHamper: boolean;
  /** Which vertical it belongs to (M20). `/gifts` is the catalogue filtered on `craft`. */
  kind: ProductKind;
  /**
   * Posted nationally, or driven over locally (M20). Deliberately separate
   * from `kind` — a kitchen posting pickles across India is a real case,
   * and `national` skips the delivery-radius filter entirely.
   */
  shippingScope: ProductShippingScope;
  /** Puts it on the WhatsApp snacks menu (M20). */
  isSnack: boolean;
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
      isHamper: input.isHamper,
      kind: input.kind,
      shippingScope: input.shippingScope,
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
    product.isHamper = input.isHamper;
    product.kind = input.kind;
    product.shippingScope = input.shippingScope;
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

  return http.patch<Product>(`/seller/listings/${encodeURIComponent(productId)}`, input);
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
 * Mock-mode mirror of the server's `mapOrderForSeller` (M37): filter a
 * buyer-shaped mock `Order` down to this vendor's own lines, sum their
 * subtotal, and flag whether other kitchens share the order. Real mode
 * receives this projection straight from `GET /seller/orders*`, so no
 * client-side filtering (or product-id cache) exists there any more.
 */
function toSellerOrder(order: Order, vendorId: string): SellerOrder {
  const own = order.items.filter(
    (item) => item.productId && getProductByIdData(item.productId)?.vendorId === vendorId,
  );
  const ownAddressIds = new Set(own.map((i) => i.addressId));
  return {
    id: order.id,
    orderNumber: order.orderNumber,
    status: order.status,
    items: own,
    itemsSubtotal: Math.round(own.reduce((sum, i) => sum + i.price * i.quantity, 0) * 100) / 100,
    shippingAddressIds: order.shippingAddressIds.filter((id) => ownAddressIds.has(id)),
    shipments: order.shipments.filter((s) => ownAddressIds.has(s.addressId)),
    gift: order.gift,
    placedAt: order.placedAt,
    cancelledAt: order.cancelledAt,
    deliveredAt: order.deliveredAt,
    paymentMethod: order.paymentMethod,
    multiVendor: own.length !== order.items.length,
  };
}

export interface SellerOrdersPage {
  items: SellerOrder[];
  page: number;
  pageSize: number;
  total: number;
}

/** One page (M37 — the endpoint stopped returning a kitchen's entire history). Mock mode pages the seed/live merge the same way. */
export async function getSellerOrders(vendorId: string, page = 1): Promise<SellerOrdersPage> {
  const pageSize = 50;
  if (isMockMode()) {
    const placed = await getPlacedOrders();
    const all = [...seedOrders, ...placed]
      .filter((order) => orderIncludesVendor(order, vendorId))
      .sort((a, b) => new Date(b.placedAt).getTime() - new Date(a.placedAt).getTime())
      .map((order) => toSellerOrder(order, vendorId));
    return {
      items: all.slice((page - 1) * pageSize, page * pageSize),
      page,
      pageSize,
      total: all.length,
    };
  }

  return http.get<SellerOrdersPage>("/seller/orders", {
    query: page > 1 ? { page: String(page) } : undefined,
  });
}

export async function getSellerOrder(
  vendorId: string,
  orderId: string,
): Promise<SellerOrder | undefined> {
  if (isMockMode()) {
    const { items } = await getSellerOrders(vendorId);
    return items.find((o) => o.id === orderId);
  }
  try {
    return await http.get<SellerOrder>(`/seller/orders/${encodeURIComponent(orderId)}`);
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

export async function advanceSellerOrderStatus(
  vendorId: string,
  orderId: string,
): Promise<SellerOrder | undefined> {
  if (isMockMode()) {
    const placed = await getPlacedOrders();
    const order = [...seedOrders, ...placed].find((o) => o.id === orderId);
    if (!order) return undefined;
    const next = nextFulfillmentStatus(order.status);
    if (next) order.status = next;
    return toSellerOrder(order, vendorId);
  }

  return http.post<SellerOrder>(`/seller/orders/${encodeURIComponent(orderId)}/advance`);
}

/**
 * "Mango Thokku Pickle ×2, Ragi Almond Cookies ×1" — for the order-list
 * rows. A `SellerOrder`'s items are already only this seller's own (the
 * server projects them since M37; mock mode filters in `toSellerOrder`),
 * so there is nothing left to filter here.
 */
export function describeSellerOrderItems(order: SellerOrder): string {
  if (order.items.length === 0) return "—";
  return order.items.map((item) => `${item.name} ×${item.quantity}`).join(", ");
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
  const [ordersPage, listings, payoutList, vendor] = await Promise.all([
    vendorId
      ? getSellerOrders(vendorId)
      : Promise.resolve<SellerOrdersPage>({ items: [], page: 1, pageSize: 50, total: 0 }),
    vendorId ? getSellerListings(vendorId) : Promise.resolve<Product[]>([]),
    getSellerPayouts(seller.id),
    vendorId ? getSellerVendor(vendorId) : Promise.resolve<Vendor | undefined>(undefined),
  ]);

  const today = new Date().toISOString().slice(0, 10);
  // Newest page is enough for a "today" count — mock mode only.
  const todayOrders = ordersPage.items.filter((o) => o.placedAt.slice(0, 10) === today);
  const lowStockCount = listings.reduce(
    (count, product) =>
      count + product.weightOptions.filter((w) => w.stock < LOW_STOCK_THRESHOLD).length,
    0,
  );

  return {
    todayOrdersCount: todayOrders.length,
    todayRevenue: todayOrders.reduce((sum, o) => sum + o.itemsSubtotal, 0),
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

/**
 * The commission block `GET /seller/payouts` computes beside the rows
 * (M37). While `enabled` is false the figures are an *estimate at the
 * configured rate* and a payout request pays `grossPending`; enabled,
 * it pays `netPending`. `pendingBalance` on the page is always the
 * figure a request would actually pay.
 */
export interface SellerPayoutCommission {
  enabled: boolean;
  pct: number;
  grossPending: number;
  commissionOnPending: number;
  netPending: number;
}

export interface SellerPayoutsPage {
  items: Payout[];
  summary: SellerEarningsSummary;
  pendingBalance: number;
  commission: SellerPayoutCommission;
}

/**
 * The whole payouts screen in one call — rows, summary, and what a
 * request would pay right now with its arithmetic. Mock mode derives the
 * same shape from the seed ledger at the shipped defaults (10%, off).
 */
export async function getSellerPayoutsPage(sellerId: string): Promise<SellerPayoutsPage> {
  if (isMockMode()) {
    const items = await getSellerPayouts(sellerId);
    const summary = await getSellerEarningsSummary(sellerId);
    // The offline ledger has no delivered-order stream to compute an
    // unclaimed balance from, so mock mode models the requested-pending
    // figure as the requestable one (pre-M37 behaviour) and estimates the
    // split at the shipped defaults (10%, deduction off).
    const grossPending = summary.totalPending;
    const commissionOnPending = Math.round(grossPending * 10) / 100;
    return {
      items,
      summary,
      pendingBalance: grossPending,
      commission: {
        enabled: false,
        pct: 10,
        grossPending,
        commissionOnPending,
        netPending: Math.round((grossPending - commissionOnPending) * 100) / 100,
      },
    };
  }
  return http.get<SellerPayoutsPage>("/seller/payouts");
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
 * `POST /seller/payouts/request` — asks for the **whole** pending
 * balance. There is no amount parameter because the server computes the
 * figure itself and never trusts a client-submitted one (`docs/API.md`).
 *
 * It used to take one anyway, "kept on the signature so the call site
 * doesn't need to change; ignored" — and the call site duly rendered an
 * Amount box, validated it as greater than zero, and threw it away. A
 * HomeKrafter with ₹6,210 pending could type 1,000 and get a request for
 * ₹6,210. The 2026-08-07 audit removed the field and this parameter with
 * it.
 *
 * `pendingAmount` is **mock-mode only** — the offline ledger has no
 * server to compute against, and a mock payout of ₹0 would misrepresent
 * what the real one does.
 */
export async function requestSellerPayout(
  sellerId: string,
  pendingAmount = 0,
): Promise<Payout> {
  if (isMockMode()) {
    const today = new Date().toISOString().slice(0, 10);
    const payout: Payout = {
      id: `po-${Date.now()}`,
      sellerId,
      amount: pendingAmount,
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

  return http.patch<Vendor>("/seller/storefront", input);
}

/**
 * Rewrite what the signed-in HomeKrafter makes (`PATCH
 * /seller/specialties`, M33).
 *
 * The owner's ask: somebody registered for food should be able to take on
 * gifting and the other categories **under the same account**, rather than
 * filing a second application. Access was never the obstacle — one supply
 * role has had every portal module since M12 and `specialties` is
 * discovery metadata that must never gate anything — but until now there
 * was no route to change the tags after approval, so the `/sell` form's
 * promise that "you can change this later" was false.
 *
 * The full set is sent, not a delta: the UI is chips, so the user's intent
 * is the final selection, and dropping a category has to work as well as
 * adding one.
 *
 * Returns the stored list, so callers re-render from what the server saved
 * rather than what they hoped it saved.
 */
export async function updateSellerSpecialties(
  specialties: SellerSpecialty[],
): Promise<SellerSpecialty[] | undefined> {
  if (isMockMode()) {
    const seller = sellers[0];
    if (!seller) return undefined;
    seller.specialties = specialties;
    return seller.specialties;
  }

  const result = await http.patch<{ specialties: SellerSpecialty[] }>(
    "/seller/specialties",
    { specialties },
  );
  return result.specialties;
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
  /**
   * Where a rider collects (M36c) — the HomeKrafter's own address, and
   * theirs to change, because people move.
   *
   * **Changing any of these clears `addressVerified` server-side**, the
   * same rule `fssaiNumber` follows: a badge that survives an edit to the
   * thing it verifies is a badge the seller set themselves.
   *
   * Private. Never rendered on a buyer-facing surface — see
   * `PickupAddress` in `lib/types/marketplace.ts`.
   */
  pickupAddressLine1?: string;
  pickupAddressLine2?: string;
  pickupLandmark?: string;
  pickupPincode?: string;
  pickupPhone?: string;
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
  return http.patch<OwnVendorProfile>("/seller/profile", input);
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
  return http.delete<VendorPhoto[]>(`/seller/profile/photos/${encodeURIComponent(photoId)}`);
}

// --- Days off (M16, M2) ----------------------------------------------
// Specific dates, not a recurring rule: the weekly pattern is already
// `workingDays` on the profile, and this is the exception to it.

export async function getSellerBlackouts(): Promise<VendorBlackout[]> {
  if (isMockMode()) return [];
  try {
    return await http.get<VendorBlackout[]>("/seller/profile/blackouts");
  } catch {
    return [];
  }
}

export async function addSellerBlackout(
  date: string,
  reason?: string,
): Promise<VendorBlackout[] | undefined> {
  if (isMockMode()) return [{ id: `bo-${date}`, date, reason }];
  try {
    return await http.post<VendorBlackout[]>("/seller/profile/blackouts", { date, reason });
  } catch {
    return undefined;
  }
}

export async function removeSellerBlackout(id: string): Promise<VendorBlackout[] | undefined> {
  if (isMockMode()) return [];
  return http.delete<VendorBlackout[]>(
    `/seller/profile/blackouts/${encodeURIComponent(id)}`,
  );
}

// ---------------------------------------------------------------------------
// Analytics (M16, H6) — `/seller/analytics`
//
// Revenue here is the HomeKrafter's **line-item share**, not the order
// total: a marketplace order can span several kitchens, so crediting each
// of them with the whole `Order.total` would overstate what a home cook
// earns and disagree with what they are actually paid out. The server
// computes it that way; this is only the transport.
// ---------------------------------------------------------------------------

export async function getSellerAnalytics(days = 30): Promise<SellerAnalytics | undefined> {
  if (isMockMode()) return mockSellerAnalytics(days);
  try {
    return await http.get<SellerAnalytics>(`/seller/analytics?days=${encodeURIComponent(days)}`);
  } catch {
    return undefined;
  }
}

/**
 * Offline shim. Shaped like real output but derived from the seed orders
 * this module already holds, so the charts have something to draw without
 * a backend — not a second implementation of the real attribution rules.
 */
function mockSellerAnalytics(days: number): SellerAnalytics {
  const to = new Date();
  const from = new Date(to.getTime() - (days - 1) * 86_400_000);
  const series = Array.from({ length: days }, (_, i) => {
    const date = new Date(from.getTime() + i * 86_400_000).toISOString().slice(0, 10);
    const orderCount = i % 4 === 0 ? 2 : i % 3 === 0 ? 1 : 0;
    return { date, orderCount, revenue: orderCount * 640 };
  });
  const revenue = series.reduce((sum, p) => sum + p.revenue, 0);
  const orderCount = series.reduce((sum, p) => sum + p.orderCount, 0);
  return {
    days,
    from: series[0]?.date ?? to.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
    totals: {
      revenue,
      orderCount,
      averageOrderValue: orderCount === 0 ? 0 : Math.round(revenue / orderCount),
      unitsSold: orderCount * 2,
      revenueChangePct: 0.18,
      orderCountChangePct: 0.1,
      repeatRate: 0.34,
      cancellationRate: 0.04,
    },
    series,
    topItems: seedProducts.slice(0, 4).map((p, i) => ({
      productId: p.id,
      name: p.name,
      unitsSold: 24 - i * 5,
      revenue: (24 - i * 5) * 320,
    })),
    byWeekday: Array.from({ length: 7 }, (_, weekday) => ({
      weekday,
      orderCount: [1, 4, 3, 5, 6, 9, 7][weekday],
      revenue: [1, 4, 3, 5, 6, 9, 7][weekday] * 640,
    })),
  };
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

// `updatePartnerBookingSlots` and `getPartnerDashboard` left in M37 with
// the withdrawn laundry module: the first was mock-only in every mode (a
// "Save slots" that never reached the server), the second fed a
// dashboard component the single-role merge had already orphaned.

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

  return http.patch<Snack>(`/seller/menu/${encodeURIComponent(snackId)}`, input);
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
