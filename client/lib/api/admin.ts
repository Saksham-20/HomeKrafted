/**
 * Unscoped admin API — real as of M8.4b (`server/src/admin/*`, `docs/API.md`
 * "Admin panel (M8.3c)"). Every real branch hits an `@Roles('admin')`
 * `/admin/*` endpoint, unscoped (spans every user/seller/order/wallet, never
 * filtered to a caller's own resource) and audit-logged server-side on every
 * mutation. `NEXT_PUBLIC_USE_MOCK=true` keeps the pre-M8.4b mock behavior
 * byte-for-byte (module-level arrays, lost on reload) — see each function's
 * `if (isMockMode())` branch.
 *
 * **Two functions have no real backend and stay mock-only** (flagged, not
 * silently left half-working):
 * - `updateProductAdmin` — `server/src/admin/catalog.controller.ts` only
 *   exposes `PATCH .../moderate` (hide/unhide/flag/feature toggles), no
 *   generic full-record edit endpoint for a *different* vendor's listing
 *   (an admin token also can't call the maker-only `PATCH
 *   /seller/listings/:id` — that whole controller is `@Roles('seller')`).
 *   A future milestone needs a dedicated `PATCH /admin/catalog/products/:id`
 *   if full admin-side listing edits are wanted.
 * - `updateHomePromoBand`/`getHomePromoBands` — no home-promo-band table or
 *   endpoint exists server-side at all (`docs/API.md`'s "Site chrome & misc"
 *   still lists this as static/content, not domain data).
 *
 * `createSellerApplication` (`lib/api/sell.ts`, the public `/sell` form) also
 * has no real endpoint yet — out of this milestone's scope — so a real-mode
 * admin approval queue only ever shows the seeded `SellerApplication` rows
 * (`server/prisma/seed.ts`), not anything submitted live via `/sell`.
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
import { toAppUser, type SessionUser } from "@/lib/auth/session";
import { http, isMockMode } from "./http";
import { getCategories, getOccasions } from "./catalog";
import { getPlacedBookings } from "./laundry";
import { getPlacedOrders } from "./orders";
import { getAllSnackOrders, getSellerPayouts, type SellerListingInput } from "./seller";
import {
  getSellerApplicationById,
  getSellerApplications as getSellerApplicationsMock,
  setSellerApplicationStatus,
} from "./sell";
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

/**
 * Maps the server's `PublicUser` (`id/name/email/phone/role/referralCode/
 * createdAt/suspended` — never `authProviders`/`walletId`/`loyaltyAccountId`,
 * see `server/src/auth/auth.service.ts#PublicUser`) onto the client `User`
 * shape via the exact same `toAppUser` helper `AuthContext` already uses for
 * the signed-in session user — same synthesized placeholders
 * (`authProviders: []`, `walletId`/`loyaltyAccountId` as `"wallet-"`/
 * `"loyalty-"` + id), so admin screens render identically to the session
 * path instead of inventing a second adaptation.
 */
function toAdminUser(sessionUser: SessionUser): User {
  return toAppUser(sessionUser);
}

export async function getAllUsers(): Promise<User[]> {
  if (isMockMode()) return users;
  const list = await http.get<SessionUser[]>("/admin/users");
  return list.map(toAdminUser);
}

export async function getUserById(id: string): Promise<User | undefined> {
  if (isMockMode()) return users.find((u) => u.id === id);
  try {
    const found = await http.get<SessionUser>(`/admin/users/${encodeURIComponent(id)}`);
    return toAdminUser(found);
  } catch {
    return undefined;
  }
}

export async function setUserSuspended(id: string, suspended: boolean): Promise<User | undefined> {
  if (isMockMode()) {
    const user = users.find((u) => u.id === id);
    if (!user) return undefined;
    user.suspended = suspended;
    return user;
  }
  try {
    const updated = await http.patch<SessionUser>(`/admin/users/${encodeURIComponent(id)}`, { suspended });
    return toAdminUser(updated);
  } catch {
    return undefined;
  }
}

// ---------------------------------------------------------------------------
// Sellers + the onboarding approval queue — closes the `/sell` → admin →
// seller-access loop: a pending `SellerApplication` becomes an active
// `Seller` (+ `Vendor` storefront) once approved. Real mode:
// `server/src/admin/sellers.controller.ts`.
// ---------------------------------------------------------------------------

export async function getAllSellers(): Promise<Seller[]> {
  if (isMockMode()) return sellers;
  return http.get<Seller[]>("/admin/sellers");
}

export async function getSellerById(id: string): Promise<Seller | undefined> {
  if (isMockMode()) return sellers.find((s) => s.id === id);
  try {
    return await http.get<Seller>(`/admin/sellers/${encodeURIComponent(id)}`);
  } catch {
    return undefined;
  }
}

/**
 * Not exported — `lib/api/sell.ts` already exports a `getSellerApplications`
 * (mock, used by the `/sell` flow's own bookkeeping); re-declaring the name
 * here too would make `@/lib/api`'s barrel (`export * from "./sell"` +
 * `export * from "./admin"`) ambiguous. Every real admin call site only
 * ever needs `getPendingSellerApplications` below, so this stays a private
 * helper for that one function.
 */
async function getAllSellerApplicationsAdmin(): Promise<SellerApplication[]> {
  if (isMockMode()) return getSellerApplicationsMock();
  return http.get<SellerApplication[]>("/admin/sellers/applications");
}

/** Applications still awaiting a decision — every status short of the two terminal ones (`approved`/`rejected`); see `SellerApplicationStatus`'s doc comment. Real mode: `?status=pending` narrows `AdminSellersService.listApplications` to the same "every non-terminal status" set. */
export async function getPendingSellerApplications(): Promise<SellerApplication[]> {
  if (isMockMode()) {
    const all = await getAllSellerApplicationsAdmin();
    return all.filter((a) => a.status !== "approved" && a.status !== "rejected");
  }
  return http.get<SellerApplication[]>("/admin/sellers/applications", { query: { status: "pending" } });
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
 * Approves a pending `SellerApplication`. Mock mode: mints a synthetic
 * `Vendor`/`Seller` pair with a placeholder `Seller.userId` (no real
 * account, see the doc comment this used to carry). Real mode: `POST
 * /admin/sellers/applications/:id/approve` — one atomic server transaction
 * that finds-or-creates a real `User` account, `Vendor`, and `approved`
 * `Seller` row (`docs/API.md`'s "Sellers + the onboarding approval queue"),
 * a real fix over the mock's synthetic id.
 */
export async function approveSellerApplication(
  applicationId: string,
): Promise<ApproveSellerApplicationResult | undefined> {
  if (!isMockMode()) {
    try {
      return await http.post<ApproveSellerApplicationResult>(
        `/admin/sellers/applications/${encodeURIComponent(applicationId)}/approve`,
      );
    } catch {
      return undefined;
    }
  }

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
  if (!isMockMode()) {
    try {
      return await http.post<SellerApplication>(
        `/admin/sellers/applications/${encodeURIComponent(applicationId)}/reject`,
      );
    } catch {
      return undefined;
    }
  }
  return setSellerApplicationStatus(applicationId, "rejected");
}

/** Suspend an active seller, or reactivate a suspended one — the same `Seller.status` field the 3 demo sellers and every admin-approved seller share. */
export async function setSellerStatus(sellerId: string, status: SellerStatus): Promise<Seller | undefined> {
  if (isMockMode()) {
    const seller = sellers.find((s) => s.id === sellerId);
    if (!seller) return undefined;
    seller.status = status;
    return seller;
  }
  if (status !== "approved" && status !== "suspended") return undefined;
  try {
    return await http.patch<Seller>(`/admin/sellers/${encodeURIComponent(sellerId)}/status`, { status });
  } catch {
    return undefined;
  }
}

// ---------------------------------------------------------------------------
// Orders oversight — unifies marketplace `Order`s, `LaundryBooking`s and
// `SnackOrder`s into one read-only shape for `/admin/orders`. Real mode:
// `server/src/admin/orders.controller.ts` already returns this exact
// unified shape server-side — no client-side aggregation needed.
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
   * The `User.id` a wallet refund would credit (`/admin/wallet`) — set for
   * marketplace `Order`s and `LaundryBooking`s (both carry a real
   * `userId`), left `undefined` for `SnackOrder`s (WhatsApp-only, no
   * registered account/wallet — see `SnackOrder`'s doc comment).
   * `OrderDetailClient` only renders the refund form when this is present.
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
  if (!isMockMode()) {
    return http.get<AdminOrderSummary[]>("/admin/orders");
  }

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

/**
 * The one summary row matching a `/admin/orders/[type]/[id]` route.
 * Real mode: no dedicated single-summary endpoint exists (only the full
 * per-type record, via `getAdminMarketplaceOrder`/etc. below, and the
 * unified list) — resolved by filtering the same unified list this module
 * already fetches, same "no by-id endpoint, resolve from the full list"
 * pattern `lib/api/products.ts#getProductById` uses.
 */
export async function getAdminOrderById(type: AdminOrderType, id: string): Promise<AdminOrderSummary | undefined> {
  const all = await getAllOrdersUnified();
  return all.find((o) => o.id === `${type}:${id}`);
}

/** Full record fetch for `/admin/orders/[type]/[id]` — the summary above is deliberately thin (list-row shaped); the detail screen needs the real `Order`/`LaundryBooking`/`SnackOrder` for its line items. */
export async function getAdminMarketplaceOrder(id: string): Promise<Order | undefined> {
  if (isMockMode()) {
    const placed = await getPlacedOrders();
    return [...seedOrders, ...placed].find((o) => o.id === id);
  }
  try {
    return await http.get<Order>(`/admin/orders/marketplace/${encodeURIComponent(id)}`);
  } catch {
    return undefined;
  }
}

export async function getAdminLaundryBooking(id: string): Promise<LaundryBooking | undefined> {
  if (isMockMode()) {
    const placed = await getPlacedBookings();
    return [...seedLaundryBookings, ...placed].find((b) => b.id === id);
  }
  try {
    return await http.get<LaundryBooking>(`/admin/orders/laundry/${encodeURIComponent(id)}`);
  } catch {
    return undefined;
  }
}

export async function getAdminSnackOrder(id: string): Promise<SnackOrder | undefined> {
  if (isMockMode()) {
    const all = await getAllSnackOrders();
    return all.find((o) => o.id === id);
  }
  try {
    return await http.get<SnackOrder>(`/admin/orders/snack/${encodeURIComponent(id)}`);
  } catch {
    return undefined;
  }
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
  /** Real mode: server-side `Wallet.balance` aggregate (`server/src/admin/dashboard.service.ts`). Mock mode: sum of every seeded `Wallet` balance (`adminWalletsByUser`). */
  walletLiability: number;
}

export async function getAdminDashboard(): Promise<AdminDashboardSnapshot> {
  if (!isMockMode()) {
    return http.get<AdminDashboardSnapshot>("/admin/dashboard");
  }

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
// Catalog & review moderation (`/admin/catalog`) — every `Product` across
// every vendor, unscoped. Real mode: `server/src/admin/catalog.controller.ts`.
// ---------------------------------------------------------------------------

export interface AdminProductSummary extends Product {
  vendorName: string;
  categoryName: string;
}

export async function getAllProductsAdmin(): Promise<AdminProductSummary[]> {
  if (!isMockMode()) {
    return http.get<AdminProductSummary[]>("/admin/catalog/products");
  }
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

/** Client's 5-value `ProductModerationAction` → the server DTO's 7 explicit toggle values (`docs/API.md`: "the mock's 'approve' here is 'unhide'"). */
const SERVER_MODERATION_ACTION: Record<ProductModerationAction, string> = {
  approve: "unhide",
  hide: "hide",
  flag: "flag",
  feature: "feature",
  unfeature: "unfeature",
};

export async function moderateProduct(
  productId: string,
  action: ProductModerationAction,
): Promise<Product | undefined> {
  if (!isMockMode()) {
    try {
      return await http.patch<AdminProductSummary>(
        `/admin/catalog/products/${encodeURIComponent(productId)}/moderate`,
        { action: SERVER_MODERATION_ACTION[action] },
      );
    } catch {
      return undefined;
    }
  }

  const product = products.find((p) => p.id === productId);
  if (!product) return undefined;

  const nextStatus = MODERATION_STATUS_BY_ACTION[action];
  if (nextStatus) product.moderationStatus = nextStatus;
  if (action === "feature") product.featured = true;
  if (action === "unfeature") product.featured = false;

  return product;
}

/**
 * **Stays mock-only** — no real endpoint exists for a full admin-side
 * listing edit (only the moderate-action toggles above); see this file's
 * header comment. Mirrors `lib/api/seller.ts#updateSellerListing` exactly,
 * minus the `vendorId` scope.
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
  if (!isMockMode()) {
    return http.get<AdminReviewSummary[]>("/admin/catalog/reviews");
  }
  return reviews.map((review) => ({ ...review, targetName: resolveReviewTargetName(review) }));
}

/** Hides/unhides a review — mutates the shared `Review` object (mock mode), filtered by (or restored to) `getProductReviews`/`getVendorReviews` (`lib/api/reviews.ts`) on their next server-side read. Doesn't clear `flagged`: a moderator hiding a flagged review is expected to leave the flag as an audit trail of why it was hidden. */
export async function moderateReview(reviewId: string, hidden: boolean): Promise<Review | undefined> {
  if (!isMockMode()) {
    try {
      return await http.patch<Review>(`/admin/catalog/reviews/${encodeURIComponent(reviewId)}/moderate`, { hidden });
    } catch {
      return undefined;
    }
  }
  const review = reviews.find((r) => r.id === reviewId);
  if (!review) return undefined;
  review.hidden = hidden;
  return review;
}

// ---------------------------------------------------------------------------
// Wallet & refunds (`/admin/wallet`) — platform-wide wallet oversight. Real
// mode: `server/src/admin/wallet.controller.ts`, every mutation funnelled
// through `WalletService`'s row-locked ledger primitives server-side.
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
  if (!isMockMode()) {
    return http.get<AdminWalletOverview>("/admin/wallet");
  }

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
  if (!isMockMode()) {
    try {
      return await http.get<AdminUserWallet>(`/admin/wallet/${encodeURIComponent(userId)}`);
    } catch {
      return undefined;
    }
  }
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
 * Credits a refund to a user's wallet. Real mode: `POST
 * /admin/wallet/:userId/refund` — the server's response is now `{wallet,
 * balanceAfter, transactionId}` (M9 closed the M8.4b-flagged shape gap:
 * the created ledger row's own id is returned rather than discarded), so
 * the full `WalletTransaction` this function's callers expect to prepend
 * to their local ledger view uses the real id — only `createdAt` is
 * still a client-side stand-in (cosmetic — a hard reload's next
 * `getUserWallet` fetch shows the real row's exact timestamp).
 */
export async function issueRefund(input: IssueRefundInput): Promise<WalletTransaction | undefined> {
  if (!isMockMode()) {
    try {
      const result = await http.post<{ wallet: Wallet; balanceAfter: number; transactionId: string }>(
        `/admin/wallet/${encodeURIComponent(input.userId)}/refund`,
        { amount: input.amount, title: input.title, refType: input.refType, refId: input.refId },
      );
      return {
        id: result.transactionId,
        walletId: result.wallet.id,
        direction: "credit",
        category: "refund",
        amount: input.amount,
        balanceAfter: result.balanceAfter,
        title: input.title,
        refType: input.refType,
        refId: input.refId,
        createdAt: new Date().toISOString(),
      };
    } catch {
      return undefined;
    }
  }

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
 * Manual credit/debit not tied to an order. Real mode: `POST
 * /admin/wallet/:userId/adjust` — same `{wallet, balanceAfter,
 * transactionId}` shape as `issueRefund` above (the real ledger-row id is
 * used, no longer synthesized). A debit that would take the balance
 * negative surfaces as a `402` from `WalletService.postLedgerEntryTx` —
 * caught here and translated to `undefined`, matching the mock's
 * "rejected debit" contract exactly.
 */
export async function adjustWallet(input: AdjustWalletInput): Promise<WalletTransaction | undefined> {
  if (!isMockMode()) {
    try {
      const result = await http.post<{ wallet: Wallet; balanceAfter: number; transactionId: string }>(
        `/admin/wallet/${encodeURIComponent(input.userId)}/adjust`,
        { direction: input.direction, amount: input.amount, reason: input.reason },
      );
      return {
        id: result.transactionId,
        walletId: result.wallet.id,
        direction: input.direction,
        category: "adjustment",
        amount: input.amount,
        balanceAfter: result.balanceAfter,
        title: `Admin adjustment — ${input.reason}`,
        createdAt: new Date().toISOString(),
      };
    } catch {
      return undefined;
    }
  }

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
// Collections & CMS (`/admin/collections`) — occasion `Collection`s (title,
// occasion, product membership + order). Real mode:
// `server/src/admin/collections.controller.ts`. The home page's two promo
// bands (`lib/data/site.ts#homePromoBands`) have no server table/endpoint
// yet — `updateHomePromoBand` stays mock-only unconditionally, see this
// file's header comment.
// ---------------------------------------------------------------------------

export async function getCollectionsAdmin(): Promise<Collection[]> {
  if (!isMockMode()) return http.get<Collection[]>("/admin/collections");
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
  if (!isMockMode()) {
    const body = {
      title: input.title,
      description: input.description,
      occasionId: input.occasionId,
      productIds: input.productIds,
    };
    if (input.id) {
      return http.patch<Collection>(`/admin/collections/${encodeURIComponent(input.id)}`, body);
    }
    return http.post<Collection>("/admin/collections", body);
  }

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

/** Real mode: same public `GET /categories` the consumer catalog already reads (`lib/api/catalog.ts`) — admin has no separate scoped category table. */
export async function getCategoriesAdmin(): Promise<Category[]> {
  if (!isMockMode()) return getCategories();
  return categories;
}

/** Real mode: same public `GET /occasions` the consumer catalog already reads. */
export async function getOccasionsAdmin(): Promise<Occasion[]> {
  if (!isMockMode()) return getOccasions();
  return occasions;
}

/** **Stays mock-only** — no server table/endpoint for home promo bands exists yet; see this file's header comment. */
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
// Analytics (`/admin/analytics`) — GMV over time, orders by module, top
// sellers/products, new users, wallet flow. Real mode:
// `server/src/admin/dashboard.service.ts#getAnalytics` computes the exact
// same aggregates server-side; no client-side computation needed.
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
  if (!isMockMode()) {
    return http.get<AdminAnalyticsSnapshot>("/admin/analytics");
  }

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
