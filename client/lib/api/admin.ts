/**
 * Unscoped admin mock API (M11a) — every function here reads/writes
 * across ALL sellers/users/orders, unlike `lib/api/seller.ts` (always
 * scoped to the caller's own `vendorId`/`sellerId`). There is no real
 * authorization yet: these functions trust that only `AdminShell`'s
 * role-gated screens ever call them (`useAuth().role === "admin"`,
 * itself only a `localStorage`+cookie mock — see `AuthContext`'s file
 * header). **M8 must enforce real admin-role RBAC server-side and
 * audit-log every unscoped read/write made here** — today it's just an
 * unguarded query over the same in-memory mock arrays every other
 * `lib/api/*` module reads, with no record of who looked at or changed
 * what. Mutations follow the same session-scoped, lost-on-hard-reload
 * pattern as every other mock mutation in this codebase
 * (`lib/api/orders.ts#createOrder`, `lib/api/seller.ts`'s listing/order
 * mutations, etc.) — M8's Postgres tables replace all of it.
 */

import {
  adminWalletsByUser,
  adminWalletTransactionsByUser,
  categories,
  collections,
  getCategoryById,
  getProductById,
  getVendorById,
  homePromoBands,
  occasions,
  products,
  reviews,
  sellers,
  seedLaundryBookings,
  seedOrders,
  users,
  vendors,
} from "@/lib/data";
import type { HomePromoBandContent } from "@/lib/data";
import { getPlacedBookings } from "./laundry";
import { getPlacedOrders } from "./orders";
import { getAllSnackOrders, getSellerPayouts, type SellerListingInput } from "./seller";
import { getSellerApplicationById, getSellerApplications, setSellerApplicationStatus } from "./sell";
import type {
  Category,
  Collection,
  LaundryBooking,
  Occasion,
  Order,
  Product,
  ProductModerationStatus,
  Review,
  Seller,
  SellerApplication,
  SellerStatus,
  SellerType,
  SnackOrder,
  User,
  Vendor,
  Wallet,
  WalletTransaction,
  WalletTransactionRefType,
} from "@/lib/types";

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------

export async function getAllUsers(): Promise<User[]> {
  return users;
}

export async function getUserById(id: string): Promise<User | undefined> {
  return users.find((u) => u.id === id);
}

export async function setUserSuspended(id: string, suspended: boolean): Promise<User | undefined> {
  const user = users.find((u) => u.id === id);
  if (!user) return undefined;
  user.suspended = suspended;
  return user;
}

// ---------------------------------------------------------------------------
// Sellers + the onboarding approval queue — closes the M7b `/sell` →
// M11a admin loop: a pending `SellerApplication` becomes an active
// `Seller` (+ `Vendor` storefront for marketplace types) once approved.
// ---------------------------------------------------------------------------

export async function getAllSellers(): Promise<Seller[]> {
  return sellers;
}

export async function getSellerById(id: string): Promise<Seller | undefined> {
  return sellers.find((s) => s.id === id);
}

export { getSellerApplications };

/** Applications still awaiting a decision — every status short of the two terminal ones (`approved`/`rejected`); see `SellerApplicationStatus`'s doc comment. */
export async function getPendingSellerApplications(): Promise<SellerApplication[]> {
  const all = await getSellerApplications();
  return all.filter((a) => a.status !== "approved" && a.status !== "rejected");
}

let sellerIdSequence = 100;
function nextSellerId(): string {
  const id = `sl-${sellerIdSequence}`;
  sellerIdSequence += 1;
  return id;
}

let vendorIdSequence = 100;
function nextVendorId(): string {
  const id = `vd-${vendorIdSequence}`;
  vendorIdSequence += 1;
  return id;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export interface ApproveSellerApplicationResult {
  application: SellerApplication;
  seller: Seller;
  vendor: Vendor;
}

/**
 * Approves a pending `SellerApplication`: sets the application
 * `approved`, mints a new `Vendor` storefront from its business details
 * (`SellerApplicationCategory` maps 1:1 onto `VendorType` except
 * `"other"`, which reads as a plain `"maker"` storefront — the closest
 * fit among the 3 real `VendorType`s an application can become), and an
 * `approved`-status `Seller` (`type: "maker"`, the only `SellerType`
 * `/sell`-origin applications become — laundry/snack partners are
 * onboarded outside this flow today, no application type for them yet)
 * pointing at it.
 *
 * No real `User`/session exists for the new seller yet — a live
 * onboarding would invite one by email at this point; `Seller.userId`
 * here is a synthetic placeholder id rather than a real account,
 * flagged explicitly so it isn't mistaken for one. M8's real onboarding
 * creates the account (and probably an actual invite/verification step)
 * before the `Seller` row, not after.
 */
export async function approveSellerApplication(
  applicationId: string,
): Promise<ApproveSellerApplicationResult | undefined> {
  const application = await getSellerApplicationById(applicationId);
  if (!application) return undefined;

  const vendorId = nextVendorId();
  const vendor: Vendor = {
    id: vendorId,
    slug: `${slugify(application.businessName)}-${vendorId.slice(-5)}`,
    name: application.businessName,
    type: application.category === "other" ? "maker" : application.category,
    bio: application.description,
    avatarPlaceholder: `${application.businessName} — AVATAR`,
    bannerPlaceholder: `${application.businessName} — BANNER`,
    location: application.city,
    rating: 0,
    reviewCount: 0,
    followerCount: 0,
    joinedAt: new Date().toISOString().slice(0, 10),
  };
  vendors.push(vendor);

  const sellerId = nextSellerId();
  const seller: Seller = {
    id: sellerId,
    userId: `user-${sellerId}`, // synthetic — no real account yet, see doc comment above
    type: "maker",
    vendorId,
    displayName: application.businessName,
    status: "approved",
    createdAt: new Date().toISOString(),
  };
  sellers.push(seller);

  const decided = await setSellerApplicationStatus(applicationId, "approved");
  return { application: decided ?? application, seller, vendor };
}

export async function rejectSellerApplication(applicationId: string): Promise<SellerApplication | undefined> {
  return setSellerApplicationStatus(applicationId, "rejected");
}

/** Suspend an active seller, or reactivate a suspended one — the same `Seller.status` field the 3 demo sellers and every M11a-approved seller share. */
export async function setSellerStatus(sellerId: string, status: SellerStatus): Promise<Seller | undefined> {
  const seller = sellers.find((s) => s.id === sellerId);
  if (!seller) return undefined;
  seller.status = status;
  return seller;
}

// ---------------------------------------------------------------------------
// Orders oversight — unifies marketplace `Order`s, `LaundryBooking`s and
// `SnackOrder`s into one read-only shape for `/admin/orders`. Not a new
// domain entity (no `lib/types` addition): a display-layer aggregation,
// the same way `SellerDashboardSnapshot` (`lib/api/seller.ts`) is.
// ---------------------------------------------------------------------------

export type AdminOrderType = "marketplace" | "laundry" | "snack";

export interface AdminOrderSummary {
  /** `${type}:${the underlying record's id}` — unique across all 3 source tables; `/admin/orders/[type]/[id]` re-derives this same key from its route params. */
  id: string;
  type: AdminOrderType;
  reference: string;
  customerName: string;
  customerPhone?: string;
  /**
   * The `User.id` a wallet refund would credit (M11b `/admin/wallet`) —
   * set for marketplace `Order`s and `LaundryBooking`s (both carry a real
   * `userId`), left `undefined` for `SnackOrder`s (WhatsApp-only, no
   * registered account/wallet to refund — see `SnackOrder`'s doc
   * comment). `OrderDetailClient` only renders the refund form when this
   * is present.
   */
  customerUserId?: string;
  sellerNames: string[];
  status: string;
  total: number;
  placedAt: string;
}

function resolveUserName(userId: string): string {
  return users.find((u) => u.id === userId)?.name ?? "Unknown customer";
}

/** A marketplace order's item lines don't carry `vendorId` directly — resolved via each line's `Product`, same join `lib/api/seller.ts#orderIncludesVendor` already does. A mixed-vendor order can list more than one name. */
function vendorNamesForOrder(order: Order): string[] {
  const names = new Set<string>();
  for (const item of order.items) {
    if (!item.productId) continue;
    const product = getProductById(item.productId);
    if (!product) continue;
    const vendor = getVendorById(product.vendorId);
    if (vendor) names.add(vendor.name);
  }
  return names.size > 0 ? Array.from(names) : ["—"];
}

function partnerNameForBooking(booking: LaundryBooking): string[] {
  if (!booking.partnerId) return ["Unassigned"];
  return [sellers.find((s) => s.id === booking.partnerId)?.displayName ?? "Unassigned"];
}

function sellerNameForSnackOrder(order: SnackOrder): string[] {
  return [sellers.find((s) => s.id === order.sellerId)?.displayName ?? "Unknown seller"];
}

export async function getAllOrdersUnified(): Promise<AdminOrderSummary[]> {
  const [placedOrders, placedBookings, snackOrders] = await Promise.all([
    getPlacedOrders(),
    getPlacedBookings(),
    getAllSnackOrders(),
  ]);

  const marketplace: AdminOrderSummary[] = [...seedOrders, ...placedOrders].map((order) => ({
    id: `marketplace:${order.id}`,
    type: "marketplace",
    reference: order.orderNumber,
    customerName: resolveUserName(order.userId),
    customerUserId: order.userId,
    sellerNames: vendorNamesForOrder(order),
    status: order.status,
    total: order.total,
    placedAt: order.placedAt,
  }));

  const laundry: AdminOrderSummary[] = [...seedLaundryBookings, ...placedBookings].map((booking) => ({
    id: `laundry:${booking.id}`,
    type: "laundry",
    reference: booking.bookingNumber,
    customerName: resolveUserName(booking.userId),
    customerUserId: booking.userId,
    sellerNames: partnerNameForBooking(booking),
    status: booking.status,
    total: booking.estimatedTotal,
    placedAt: booking.createdAt,
  }));

  const snacks: AdminOrderSummary[] = snackOrders.map((order) => ({
    id: `snack:${order.id}`,
    type: "snack",
    reference: order.id.toUpperCase(),
    customerName: order.customerName,
    customerPhone: order.customerPhone,
    sellerNames: sellerNameForSnackOrder(order),
    status: order.status,
    total: order.total,
    placedAt: order.createdAt,
  }));

  return [...marketplace, ...laundry, ...snacks].sort(
    (a, b) => new Date(b.placedAt).getTime() - new Date(a.placedAt).getTime(),
  );
}

/** The one summary row matching a `/admin/orders/[type]/[id]` route — `OrderDetailClient` uses this for the customer/seller/status/total header, and one of the 3 full-record getters below for line-item detail. */
export async function getAdminOrderById(type: AdminOrderType, id: string): Promise<AdminOrderSummary | undefined> {
  const all = await getAllOrdersUnified();
  return all.find((o) => o.id === `${type}:${id}`);
}

/** Full record fetch for `/admin/orders/[type]/[id]` — the summary above is deliberately thin (list-row shaped); the detail screen needs the real `Order`/`LaundryBooking`/`SnackOrder` for its line items. */
export async function getAdminMarketplaceOrder(id: string): Promise<Order | undefined> {
  const placed = await getPlacedOrders();
  return [...seedOrders, ...placed].find((o) => o.id === id);
}

export async function getAdminLaundryBooking(id: string): Promise<LaundryBooking | undefined> {
  const placed = await getPlacedBookings();
  return [...seedLaundryBookings, ...placed].find((b) => b.id === id);
}

export async function getAdminSnackOrder(id: string): Promise<SnackOrder | undefined> {
  const all = await getAllSnackOrders();
  return all.find((o) => o.id === id);
}

// ---------------------------------------------------------------------------
// Dashboard snapshot
// ---------------------------------------------------------------------------

export interface AdminDashboardSnapshot {
  /** Sum of every unified order/booking/snack-order total — a mock proxy for GMV; a real revenue figure would net out vendor payout share, which M8's ledger computes server-side. */
  gmvTotal: number;
  ordersTodayCount: number;
  ordersTotalCount: number;
  ordersByType: Record<AdminOrderType, number>;
  activeSellersByType: Record<SellerType, number>;
  usersCount: number;
  pendingApplicationsCount: number;
  pendingPayoutsAmount: number;
  /** Sum of every seeded `Wallet` balance (M11b: `adminWalletsByUser`, one per account — see `/admin/wallet`). Still a mock sum computed client-side, not a real server aggregate; M8's wallet ledger computes this figure server-side instead. */
  walletLiability: number;
}

export async function getAdminDashboard(): Promise<AdminDashboardSnapshot> {
  const unified = await getAllOrdersUnified();
  const today = new Date().toISOString().slice(0, 10);

  const gmvTotal = unified.reduce((sum, o) => sum + o.total, 0);
  const ordersTodayCount = unified.filter((o) => o.placedAt.slice(0, 10) === today).length;

  const ordersByType: Record<AdminOrderType, number> = { marketplace: 0, laundry: 0, snack: 0 };
  for (const order of unified) ordersByType[order.type] += 1;

  const activeSellersByType: Record<SellerType, number> = { maker: 0, laundry: 0, snack: 0 };
  for (const seller of sellers) {
    if (seller.status === "approved") activeSellersByType[seller.type] += 1;
  }

  const pendingApplications = await getPendingSellerApplications();

  const payoutLists = await Promise.all(sellers.map((s) => getSellerPayouts(s.id)));
  const pendingPayoutsAmount = payoutLists
    .flat()
    .filter((p) => p.status === "pending")
    .reduce((sum, p) => sum + p.amount, 0);

  return {
    gmvTotal,
    ordersTodayCount,
    ordersTotalCount: unified.length,
    ordersByType,
    activeSellersByType,
    usersCount: users.length,
    pendingApplicationsCount: pendingApplications.length,
    pendingPayoutsAmount,
    walletLiability: Object.values(adminWalletsByUser).reduce((sum, w) => sum + w.balance, 0),
  };
}

// ---------------------------------------------------------------------------
// Catalog & review moderation (M11b `/admin/catalog`) — every `Product`
// across every vendor, unscoped. Moderation actions mutate the shared
// `Product`/`Review` objects in place (same pattern as `setUserSuspended`
// above): `moderateProduct`'s "hide" is a real soft-delete in intent —
// `lib/api/products.ts`'s browse/listing getters already filter
// `moderationStatus: "hidden"` out. "flag" only queues it for review
// (stays browsable). "feature"/"unfeature" toggles the same
// `Product.featured` flag `getFeatured()` reads for the home page's
// "This week's small batches" rail.
//
// **Known mock-architecture limit, not new to M11b:** the browse pages
// that read these filters (`/shop`, `/`, `/product/[slug]`,
// `/storefront/[vendor]`, `/collections/[occasion]`) are Server
// Components — they fetch on the Next.js server, a separate JS module
// graph from the browser tab this `"use client"` admin screen mutates
// in. So a hide/feature/flag/reply action here is instantly visible to
// every other admin client component in this same tab (same pattern
// `setUserSuspended`/`setSellerStatus` already document), but never
// propagates to a server-rendered consumer page without a real backend
// round-trip — the exact same boundary `lib/api/seller.ts`'s
// `updateSellerStorefront` doc comment already calls out for
// `/storefront/[vendor]`. M8's real API removes this gap entirely.
// ---------------------------------------------------------------------------

export interface AdminProductSummary extends Product {
  vendorName: string;
  categoryName: string;
}

export async function getAllProductsAdmin(): Promise<AdminProductSummary[]> {
  return products.map((product) => ({
    ...product,
    vendorName: getVendorById(product.vendorId)?.name ?? "Unknown vendor",
    categoryName: getCategoryById(product.categoryId)?.name ?? "Uncategorised",
  }));
}

export type ProductModerationAction = "approve" | "hide" | "flag" | "feature" | "unfeature";

const MODERATION_STATUS_BY_ACTION: Partial<Record<ProductModerationAction, ProductModerationStatus>> = {
  approve: "active",
  hide: "hidden",
  flag: "flagged",
};

export async function moderateProduct(
  productId: string,
  action: ProductModerationAction,
): Promise<Product | undefined> {
  const product = products.find((p) => p.id === productId);
  if (!product) return undefined;

  const nextStatus = MODERATION_STATUS_BY_ACTION[action];
  if (nextStatus) product.moderationStatus = nextStatus;
  if (action === "feature") product.featured = true;
  if (action === "unfeature") product.featured = false;

  return product;
}

/**
 * Full-record admin edit, mirroring `lib/api/seller.ts#updateSellerListing`
 * exactly, minus the `vendorId` scope — an admin can edit any vendor's
 * listing, a maker can only edit their own. Shares `SellerListingInput`/
 * `ListingForm` (`components/seller/ListingForm.tsx`) with the seller
 * surface: it's a plain presentational form driven by props, not
 * seller-shell-specific, so `/admin/catalog/[id]`'s editor reuses it
 * directly instead of forking a near-identical copy.
 */
export async function updateProductAdmin(
  productId: string,
  input: SellerListingInput,
): Promise<Product | undefined> {
  const product = products.find((p) => p.id === productId);
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

export interface AdminReviewSummary extends Review {
  /** Product name (targetType "product") or vendor name (targetType "vendor") the review is attached to. */
  targetName: string;
}

function resolveReviewTargetName(review: Review): string {
  if (review.targetType === "product") return getProductById(review.targetId)?.name ?? "Unknown product";
  if (review.targetType === "vendor") return getVendorById(review.targetId)?.name ?? "Unknown vendor";
  return "Unknown service";
}

export async function getAllReviewsAdmin(): Promise<AdminReviewSummary[]> {
  return reviews.map((review) => ({ ...review, targetName: resolveReviewTargetName(review) }));
}

/** Hides/unhides a review — mutates the shared `Review` object, filtered by (or restored to) `getProductReviews`/`getVendorReviews` (`lib/api/reviews.ts`) on their next server-side read (see this section's header comment for the client/server module-graph caveat). Doesn't clear `flagged`: a moderator hiding a flagged review is expected to leave the flag as an audit trail of why it was hidden. */
export async function moderateReview(reviewId: string, hidden: boolean): Promise<Review | undefined> {
  const review = reviews.find((r) => r.id === reviewId);
  if (!review) return undefined;
  review.hidden = hidden;
  return review;
}

// ---------------------------------------------------------------------------
// Wallet & refunds (M11b `/admin/wallet`) — platform-wide wallet
// oversight over `adminWalletsByUser`/`adminWalletTransactionsByUser`
// (`lib/data/admin.ts`), a separate per-user ledger from the consumer's
// own `WalletContext` (see that file's doc comment for why they can
// drift in this mock). **M8 must make this one real,
// server-authoritative ledger per user, with every write audit-logged
// (who issued it, when, against which order) — today it's an unguarded
// in-memory mutation with no audit trail, same caveat as every other
// unscoped admin mutation in this file.**
// ---------------------------------------------------------------------------

export interface AdminWalletUserSummary {
  userId: string;
  userName: string;
  walletId: string;
  balance: number;
  pendingCashback: number;
  lifetimeSaved: number;
  transactionCount: number;
}

export interface AdminWalletOverview {
  totalLiability: number;
  walletCount: number;
  totalLifetimeSaved: number;
  /** Every wallet, sorted by balance descending — small enough a dataset today not to need real pagination. */
  balances: AdminWalletUserSummary[];
}

function walletUserSummary(userId: string): AdminWalletUserSummary {
  const w = adminWalletsByUser[userId];
  const txns = adminWalletTransactionsByUser[userId] ?? [];
  return {
    userId,
    userName: users.find((u) => u.id === userId)?.name ?? "Unknown user",
    walletId: w.id,
    balance: w.balance,
    pendingCashback: w.pendingCashback,
    lifetimeSaved: w.lifetimeSaved,
    transactionCount: txns.length,
  };
}

export async function getWalletOverview(): Promise<AdminWalletOverview> {
  const balances = Object.keys(adminWalletsByUser)
    .map(walletUserSummary)
    .sort((a, b) => b.balance - a.balance);

  return {
    totalLiability: balances.reduce((sum, b) => sum + b.balance, 0),
    walletCount: balances.length,
    totalLifetimeSaved: balances.reduce((sum, b) => sum + b.lifetimeSaved, 0),
    balances,
  };
}

export interface AdminUserWallet {
  wallet: Wallet;
  transactions: WalletTransaction[];
}

export async function getUserWallet(userId: string): Promise<AdminUserWallet | undefined> {
  const w = adminWalletsByUser[userId];
  if (!w) return undefined;
  return { wallet: w, transactions: adminWalletTransactionsByUser[userId] ?? [] };
}

function genWalletTxnId(): string {
  return `wt-adm-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export interface IssueRefundInput {
  userId: string;
  amount: number;
  title: string;
  refType?: WalletTransactionRefType;
  refId?: string;
}

/**
 * Credits a refund to a user's wallet — same ledger shape as the
 * consumer-side `WalletContext.refund` (`category: "refund"`, `direction:
 * "credit"`), just written server-side-of-the-mock (the admin data
 * layer) instead of client `localStorage`. Wired from
 * `OrderDetailClient`'s "Issue refund" action for marketplace/laundry
 * orders (`AdminOrderSummary.customerUserId`).
 */
export async function issueRefund(input: IssueRefundInput): Promise<WalletTransaction | undefined> {
  const w = adminWalletsByUser[input.userId];
  if (!w || input.amount <= 0) return undefined;

  w.balance += input.amount;
  w.updatedAt = new Date().toISOString();

  const txn: WalletTransaction = {
    id: genWalletTxnId(),
    walletId: w.id,
    direction: "credit",
    category: "refund",
    amount: input.amount,
    balanceAfter: w.balance,
    title: input.title,
    refType: input.refType,
    refId: input.refId,
    createdAt: new Date().toISOString(),
  };

  // A new array, not `list.unshift` in place — callers (e.g.
  // `AdminUserWalletDetailClient`) typically already hold the previous
  // array in React state from an earlier `getUserWallet` and prepend
  // `txn` to their own copy on success; mutating the same array here
  // too would double up that entry (two objects, same `txn`, one React
  // key) once both writes are visible.
  const list = adminWalletTransactionsByUser[input.userId] ?? [];
  adminWalletTransactionsByUser[input.userId] = [txn, ...list];

  return txn;
}

export interface AdjustWalletInput {
  userId: string;
  direction: "credit" | "debit";
  amount: number;
  reason: string;
}

/**
 * Manual credit/debit not tied to an order — `category: "adjustment"`
 * (distinct from `"refund"`, see that category's doc comment on
 * `WalletTransactionCategory`). A debit is rejected (returns `undefined`)
 * if it would take the balance negative — an admin fixing a mistake
 * still shouldn't be able to leave a wallet in an invalid state; M8's
 * server-side ledger should enforce the same invariant transactionally.
 */
export async function adjustWallet(input: AdjustWalletInput): Promise<WalletTransaction | undefined> {
  const w = adminWalletsByUser[input.userId];
  if (!w || input.amount <= 0) return undefined;
  if (input.direction === "debit" && w.balance < input.amount) return undefined;

  w.balance += input.direction === "credit" ? input.amount : -input.amount;
  w.updatedAt = new Date().toISOString();

  const txn: WalletTransaction = {
    id: genWalletTxnId(),
    walletId: w.id,
    direction: input.direction,
    category: "adjustment",
    amount: input.amount,
    balanceAfter: w.balance,
    title: input.reason,
    createdAt: new Date().toISOString(),
  };

  // See `issueRefund`'s matching comment — new array, not an in-place mutation.
  const list = adminWalletTransactionsByUser[input.userId] ?? [];
  adminWalletTransactionsByUser[input.userId] = [txn, ...list];

  return txn;
}

// ---------------------------------------------------------------------------
// Collections & CMS (M11b `/admin/collections`) — occasion `Collection`s
// (title, occasion, product membership + order) and the home page's two
// promo bands (`lib/data/site.ts#homePromoBands`). Both mutate shared
// arrays/objects in place, same session-scoped mock-persistence caveat as
// every other admin mutation in this file.
// ---------------------------------------------------------------------------

export async function getCollectionsAdmin(): Promise<Collection[]> {
  return collections;
}

function slugifyCollection(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

let collectionIdSequence = 100;
function nextCollectionId(): string {
  const id = `cl-${collectionIdSequence}`;
  collectionIdSequence += 1;
  return id;
}

export interface UpsertCollectionInput {
  /** Present = edit an existing `Collection`; absent = create a new one. */
  id?: string;
  title: string;
  description?: string;
  occasionId?: string;
  /** Order matters — this is display order on `/collections/[occasion]`, so reordering (move up/down in the admin editor) is just re-submitting this array in the new order. */
  productIds: string[];
}

export async function upsertCollection(input: UpsertCollectionInput): Promise<Collection> {
  if (input.id) {
    const existing = collections.find((c) => c.id === input.id);
    if (existing) {
      existing.title = input.title;
      existing.description = input.description;
      existing.occasionId = input.occasionId;
      existing.productIds = input.productIds;
      return existing;
    }
  }

  const id = nextCollectionId();
  const collection: Collection = {
    id,
    slug: `${slugifyCollection(input.title)}-${id.slice(-4)}`,
    title: input.title,
    description: input.description,
    occasionId: input.occasionId,
    productIds: input.productIds,
  };
  collections.push(collection);
  return collection;
}

export async function getCategoriesAdmin(): Promise<Category[]> {
  return categories;
}

export async function getOccasionsAdmin(): Promise<Occasion[]> {
  return occasions;
}

export async function updateHomePromoBand(
  id: string,
  patch: Partial<Omit<HomePromoBandContent, "id">>,
): Promise<HomePromoBandContent | undefined> {
  const band = homePromoBands.find((b) => b.id === id);
  if (!band) return undefined;
  Object.assign(band, patch);
  return band;
}

// ---------------------------------------------------------------------------
// Analytics (M11b `/admin/analytics`) — GMV over time, orders by module,
// top sellers/products, new users, wallet flow. Derived entirely from the
// existing mock arrays (no new data model), same "display-layer
// aggregation" status as `AdminOrderSummary`/`AdminDashboardSnapshot`. No
// chart library anywhere in this codebase — `AnalyticsClient` renders
// these numbers as plain CSS bars/sparklines, the same recipe
// `AdminDashboardClient`'s "Orders by module" bar chart already uses.
// ---------------------------------------------------------------------------

export interface AnalyticsDailyPoint {
  /** ISO date (YYYY-MM-DD). */
  date: string;
  gmv: number;
  orderCount: number;
}

export interface AnalyticsLeaderboardRow {
  key: string;
  name: string;
  type: SellerType;
  orderCount: number;
  revenue: number;
}

export interface AnalyticsProductRow {
  productId: string;
  name: string;
  unitsOrdered: number;
  revenue: number;
}

export interface AnalyticsMonthPoint {
  /** "YYYY-MM". */
  month: string;
  count: number;
}

export interface AnalyticsWalletFlow {
  creditsTotal: number;
  debitsTotal: number;
  netFlow: number;
  byCategory: Record<string, number>;
}

export interface AdminAnalyticsSnapshot {
  /** Last 14 days, oldest first. */
  gmvSeries: AnalyticsDailyPoint[];
  ordersByType: Record<AdminOrderType, number>;
  /** Top 6 sellers (makers by `Vendor` revenue, laundry/snack by `Seller` revenue) by revenue, descending. */
  topSellers: AnalyticsLeaderboardRow[];
  /** Top 6 marketplace products by revenue, descending. */
  topProducts: AnalyticsProductRow[];
  newUsersByMonth: AnalyticsMonthPoint[];
  walletFlow: AnalyticsWalletFlow;
}

function last14Days(): string[] {
  const days: string[] = [];
  const today = new Date();
  for (let i = 13; i >= 0; i -= 1) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    days.push(d.toISOString().slice(0, 10));
  }
  return days;
}

async function computeGmvSeries(): Promise<AnalyticsDailyPoint[]> {
  const unified = await getAllOrdersUnified();
  return last14Days().map((date) => {
    const dayOrders = unified.filter((o) => o.placedAt.slice(0, 10) === date);
    return {
      date,
      gmv: dayOrders.reduce((sum, o) => sum + o.total, 0),
      orderCount: dayOrders.length,
    };
  });
}

async function computeSellerLeaderboard(): Promise<AnalyticsLeaderboardRow[]> {
  const [placedOrders, placedBookings, snackOrders] = await Promise.all([
    getPlacedOrders(),
    getPlacedBookings(),
    getAllSnackOrders(),
  ]);

  const byKey = new Map<string, AnalyticsLeaderboardRow>();
  function addRevenue(key: string, name: string, type: SellerType, amount: number) {
    const existing = byKey.get(key);
    if (existing) {
      existing.revenue += amount;
      existing.orderCount += 1;
    } else {
      byKey.set(key, { key, name, type, revenue: amount, orderCount: 1 });
    }
  }

  // Marketplace: attribute each line item's revenue to its product's
  // vendor (an order can span more than one vendor).
  for (const order of [...seedOrders, ...placedOrders]) {
    const vendorTotals = new Map<string, number>();
    for (const item of order.items) {
      if (!item.productId) continue;
      const product = getProductById(item.productId);
      if (!product) continue;
      vendorTotals.set(
        product.vendorId,
        (vendorTotals.get(product.vendorId) ?? 0) + item.price * item.quantity,
      );
    }
    for (const [vendorId, amount] of vendorTotals) {
      const vendor = getVendorById(vendorId);
      if (!vendor) continue;
      addRevenue(`vendor:${vendorId}`, vendor.name, "maker", amount);
    }
  }

  for (const booking of [...seedLaundryBookings, ...placedBookings]) {
    if (!booking.partnerId) continue;
    const partner = sellers.find((s) => s.id === booking.partnerId);
    if (!partner) continue;
    addRevenue(`seller:${partner.id}`, partner.displayName, "laundry", booking.estimatedTotal);
  }

  for (const order of snackOrders) {
    const seller = sellers.find((s) => s.id === order.sellerId);
    if (!seller) continue;
    addRevenue(`seller:${seller.id}`, seller.displayName, "snack", order.total);
  }

  return Array.from(byKey.values()).sort((a, b) => b.revenue - a.revenue);
}

async function computeProductLeaderboard(): Promise<AnalyticsProductRow[]> {
  const placedOrders = await getPlacedOrders();
  const byProduct = new Map<string, AnalyticsProductRow>();

  for (const order of [...seedOrders, ...placedOrders]) {
    for (const item of order.items) {
      if (!item.productId) continue;
      const revenue = item.price * item.quantity;
      const existing = byProduct.get(item.productId);
      if (existing) {
        existing.unitsOrdered += item.quantity;
        existing.revenue += revenue;
      } else {
        byProduct.set(item.productId, {
          productId: item.productId,
          name: item.name,
          unitsOrdered: item.quantity,
          revenue,
        });
      }
    }
  }

  return Array.from(byProduct.values()).sort((a, b) => b.revenue - a.revenue);
}

function computeNewUsersByMonth(): AnalyticsMonthPoint[] {
  const byMonth = new Map<string, number>();
  for (const u of users) {
    const month = u.createdAt.slice(0, 7);
    byMonth.set(month, (byMonth.get(month) ?? 0) + 1);
  }
  return Array.from(byMonth.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, count]) => ({ month, count }));
}

function computeWalletFlow(): AnalyticsWalletFlow {
  const allTxns = Object.values(adminWalletTransactionsByUser).flat();
  let creditsTotal = 0;
  let debitsTotal = 0;
  const byCategory: Record<string, number> = {};

  for (const txn of allTxns) {
    if (txn.direction === "credit") creditsTotal += txn.amount;
    else debitsTotal += txn.amount;
    byCategory[txn.category] = (byCategory[txn.category] ?? 0) + txn.amount;
  }

  return { creditsTotal, debitsTotal, netFlow: creditsTotal - debitsTotal, byCategory };
}

export async function getAnalytics(): Promise<AdminAnalyticsSnapshot> {
  const [gmvSeries, sellerLeaderboard, productLeaderboard, dashboard] = await Promise.all([
    computeGmvSeries(),
    computeSellerLeaderboard(),
    computeProductLeaderboard(),
    getAdminDashboard(),
  ]);

  return {
    gmvSeries,
    ordersByType: dashboard.ordersByType,
    topSellers: sellerLeaderboard.slice(0, 6),
    topProducts: productLeaderboard.slice(0, 6),
    newUsersByMonth: computeNewUsersByMonth(),
    walletFlow: computeWalletFlow(),
  };
}
