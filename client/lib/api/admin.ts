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
  getOwnVendorProfile,
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
import { areaById, TRICITY_CENTRE } from "@/lib/geo";

/**
 * Mirror of `server/src/admin/sellers.service.ts#VENDOR_TYPE_BY_CATEGORY`.
 * Exhaustive on purpose: the server's version used to be a
 * `as unknown as VendorType` cast, and adding a category to the enum
 * compiled fine while throwing at vendor creation. Typed this way, the
 * next category added fails to compile in both places.
 */
const VENDOR_TYPE_BY_CATEGORY: Record<SellerApplicationCategory, VendorType> = {
  home_chef: "maker",
  maker: "maker",
  baker: "baker",
  artist: "artist",
  other: "maker",
};
import type { HomePromoBandContent } from "@/lib/data";
import { toAppUser, type SessionUser } from "@/lib/auth/session";
import { ApiError, http, isMockMode } from "./http";
import { getCategories, getOccasions } from "./catalog";
import { getPlacedBookings } from "./laundry";
import { getPlacedOrders } from "./orders";
import { getAllSnackOrders, getSellerPayouts, type SellerListingInput } from "./seller";
import {
  getSellerApplicationById,
  getSellerApplications as getSellerApplicationsMock,
  setSellerApplicationArea,
  setSellerApplicationStatus,
} from "./sell";
import type {
  AdminSellerDetail,
  AdminSellerProfile,
  Category,
  Collection,
  ID,
  LaundryBooking,
  Occasion,
  Order,
  PayoutStatus,
  Product,
  ProductModerationStatus,
  Review,
  Seller,
  SellerApplication,
  SellerApplicationCategory,
  SellerSpecialty,
  SellerStatus,
  SnackOrder,
  SupportTicket,
  SupportTicketStatus,
  User,
  Vendor,
  VendorType,
  VerificationInput,
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

/** Filters for `GET /admin/users` — applied server-side in real mode. */
export interface AdminUsersQuery {
  role?: User["role"];
  status?: "active" | "suspended";
  q?: string;
  page?: number;
}

export interface AdminUsersPage {
  items: User[];
  page: number;
  pageSize: number;
  total: number;
}

/**
 * One page of accounts.
 *
 * This used to fetch **every user on the platform** so the screen could
 * filter and search the array — the one admin query that grows with the
 * entire customer base. The filters moved to the server with the
 * pagination, because a search over one page would answer "no users
 * match" for somebody who is on the phone to the admin right then.
 */
export async function getAllUsers(query: AdminUsersQuery = {}): Promise<AdminUsersPage> {
  if (isMockMode()) {
    const q = query.q?.trim().toLowerCase();
    const items = users
      .filter((u) => !query.role || u.role === query.role)
      .filter((u) =>
        !query.status ? true : query.status === "suspended" ? !!u.suspended : !u.suspended,
      )
      .filter(
        (u) =>
          !q ||
          u.name.toLowerCase().includes(q) ||
          (u.email ?? "").toLowerCase().includes(q) ||
          (u.phone ?? "").toLowerCase().includes(q),
      );
    return { items, page: 1, pageSize: items.length, total: items.length };
  }

  const params = new URLSearchParams();
  if (query.role) params.set("role", query.role);
  if (query.status) params.set("status", query.status);
  if (query.q) params.set("q", query.q);
  if (query.page && query.page > 1) params.set("page", String(query.page));
  const qs = params.toString();
  const res = await http.get<{ items: SessionUser[]; page: number; pageSize: number; total: number }>(
    `/admin/users${qs ? `?${qs}` : ""}`,
  );
  return { ...res, items: res.items.map(toAdminUser) };
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
  const updated = await http.patch<SessionUser>(`/admin/users/${encodeURIComponent(id)}`, { suspended });
  return toAdminUser(updated);
}

// ---------------------------------------------------------------------------
// Sellers + the onboarding approval queue — closes the `/sell` → admin →
// seller-access loop: a pending `SellerApplication` becomes an active
// `Seller` (+ `Vendor` storefront) once approved. Real mode:
// `server/src/admin/sellers.controller.ts`.
// ---------------------------------------------------------------------------

/** Filters for `GET /admin/sellers` — applied server-side in real mode. */
export interface AdminSellersQuery {
  specialty?: SellerSpecialty;
  q?: string;
  page?: number;
  /** M32 — `awaiting`: issued details, never used. `onboarded`: chose their own password. `no_credentials`: no password at all. */
  onboarding?: "awaiting" | "onboarded" | "no_credentials";
}

export interface AdminSellersPage {
  items: Seller[];
  page: number;
  pageSize: number;
  total: number;
}

export async function getAllSellers(query: AdminSellersQuery = {}): Promise<AdminSellersPage> {
  if (isMockMode()) {
    const q = query.q?.trim().toLowerCase();
    const items = sellers
      .filter((s) => !query.specialty || s.specialties.includes(query.specialty))
      .filter((s) => !q || s.displayName.toLowerCase().includes(q))
      .filter((s) => !query.onboarding || s.signIn?.status === query.onboarding);
    return { items, page: 1, pageSize: items.length, total: items.length };
  }
  const params = new URLSearchParams();
  if (query.specialty) params.set("specialty", query.specialty);
  if (query.q) params.set("q", query.q);
  if (query.onboarding) params.set("onboarding", query.onboarding);
  if (query.page && query.page > 1) params.set("page", String(query.page));
  const qs = params.toString();
  return http.get<AdminSellersPage>(`/admin/sellers${qs ? `?${qs}` : ""}`);
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

/** Per-channel outcome of the approval invite — mirrors `server/src/admin/seller-invite.service.ts`. */
export interface InviteChannelResult {
  attempted: boolean;
  delivered: boolean;
  stubbed: boolean;
  error?: string;
}

export interface InviteDeliveryReport {
  email: InviteChannelResult;
  sms: InviteChannelResult;
  /** `false` when nothing actually left the building. */
  reached: boolean;
  /** Present only when nothing was delivered — the link, so an admin can pass it on by hand. */
  fallbackLink?: string;
}

export interface ApproveSellerApplicationResult {
  application: SellerApplication;
  seller: Seller;
  vendor: Vendor;
  /**
   * Whether the new HomeKrafter was actually reached. **Optional** because
   * mock mode does not send anything — an absent report means "not
   * applicable", not "delivered".
   */
  invite?: InviteDeliveryReport;
  /**
   * Present only when the new storefront was planted on a pincode
   * centroid that could be well off (M36) — absent for a curated area or
   * a single-post-office pincode, so its presence means "go and check
   * this one" rather than "here are some coordinates".
   *
   * It matters because `Vendor.lat`/`lng` decides which buyers can see
   * the kitchen at all: an unchecked 12 km error shows the storefront to
   * the wrong neighbourhood and hides it from its own, and nothing else
   * on any screen would ever say so.
   */
  placement?: ApprovedPlacement;
  /**
   * Sign-in details for the account just created (M32) — optional for the
   * same reason `invite` is: mock mode has no server to mint one.
   */
  signIn?: TemporarySignInDetails;
}

/** An approved kitchen's coordinates, when they are approximate enough to be worth checking. */
export interface ApprovedPlacement {
  lat: number;
  lng: number;
  /** How far apart this pincode's post offices are — the size of the possible error. */
  spreadKm: number;
  pincode: string;
  label: string;
}

/**
 * `PATCH /admin/sellers/:id/coords` — move a kitchen to where it actually
 * is (M36).
 *
 * The correction step for a pincode centroid that was not close enough.
 * There is deliberately no seller-facing equivalent: a HomeKrafter moving
 * their own pin changes who can buy from them, which is the same class of
 * self-granted advantage as setting their own verification badge, and
 * unlike the badge it would be invisible on every screen.
 */
export async function setVendorCoords(
  sellerId: string,
  coords: { lat: number; lng: number; location?: string },
): Promise<AdminSellerDetail | undefined> {
  if (isMockMode()) return getAdminSellerDetail(sellerId);
  return http.patch<AdminSellerDetail>(
    `/admin/sellers/${encodeURIComponent(sellerId)}/coords`,
    coords,
  );
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
/** What `POST /admin/sellers/:id/temp-password` hands back — once (M32). */
export interface TemporarySignInDetails {
  email: string | null;
  phone: string | null;
  displayName: string;
  /**
   * Plaintext, and this is the **only** time it exists anywhere. The
   * server stores an argon2 hash; nothing re-reads this. Losing it means
   * issuing a new one, which is a button, not a problem.
   */
  temporaryPassword: string;
}

/**
 * `POST /admin/sellers/:id/temp-password` — sign-in details an admin can
 * read out over the phone to a HomeKrafter the invite never reached
 * (SendGrid and Twilio are unset, so it reaches nobody today).
 *
 * Errors are **not** swallowed here, unlike `approveSellerApplication`
 * below: the caller has to be able to tell "suspended, refused" from
 * "here is the password", because the difference is whether a kitchen can
 * open their shop this morning.
 */
export async function issueSellerTemporaryPassword(
  sellerId: string,
): Promise<TemporarySignInDetails> {
  if (isMockMode()) {
    // A fixed, obviously-fake value: mock mode has no server to hash
    // anything, and a *plausible* password here would invite somebody to
    // try it against the real site.
    const seller = sellers.find((s) => s.id === sellerId);
    return {
      email: `${seller?.displayName.toLowerCase().replace(/\W+/g, ".") ?? "kitchen"}@example.test`,
      phone: null,
      displayName: seller?.displayName ?? "HomeKrafter",
      temporaryPassword: "MOCK-MODE-NOT-A-REAL-PASSWORD",
    };
  }
  return http.post<TemporarySignInDetails>(
    `/admin/sellers/${encodeURIComponent(sellerId)}/temp-password`,
  );
}

/**
 * Errors are **not** swallowed, for the same reason
 * `issueSellerTemporaryPassword` doesn't swallow its own: the caller has
 * to be able to tell a refusal from a success.
 *
 * This used to be `try { ... } catch { return undefined }`, and that one
 * line defeated every guard built on top of it. The server refuses an
 * approval on purpose in three cases — an area it cannot resolve, an
 * applicant who already has a HomeKrafter account, an application already
 * decided — and each 409 carries the sentence explaining what to do next.
 * Swallowed, the rejected promise resolved instead, `SellersClient.run`
 * took the success branch, refetched, and the row came back unchanged.
 * An admin clicking Approve on a waitlisted application saw *nothing
 * happen*, with no error anywhere, forever.
 */
export async function approveSellerApplication(
  applicationId: string,
): Promise<ApproveSellerApplicationResult | undefined> {
  if (!isMockMode()) {
    return http.post<ApproveSellerApplicationResult>(
      `/admin/sellers/applications/${encodeURIComponent(applicationId)}/approve`,
    );
  }

  const application = await getSellerApplicationById(applicationId);
  if (!application) return undefined;

  // Same guard the server enforces: a placement that doesn't resolve
  // cannot become a kitchen. The mock used to fall back to
  // `TRICITY_CENTRE`, which planted an out-of-area vendor at Chandigarh's
  // exact centre — ~0 km from every buyer, passing every radius filter.
  // Mock and real must agree here, or mock mode teaches the wrong thing.
  //
  // M36: a pincode application resolves through the server's table, which
  // mock mode does not have. It places the kitchen at the tricity centre
  // *for a pincode application only*, and that is sound here for the
  // reason it was not before — the value is admitted to be approximate
  // and the real path has an admin confirm it. Mock mode has no admin and
  // no buyers.
  const resolvedArea = application.area ? areaById(application.area) : undefined;
  if (!resolvedArea && !application.pincode) return undefined;
  const placement = resolvedArea ?? {
    label: application.city,
    city: application.city,
    lat: TRICITY_CENTRE.lat,
    lng: TRICITY_CENTRE.lng,
  };

  const vendorId = nextVendorId();
  const vendor: Vendor = {
    id: vendorId,
    slug: `${slugify(application.businessName)}-${vendorId.slice(-5)}`,
    name: application.businessName,
    type: VENDOR_TYPE_BY_CATEGORY[application.category],
    bio: application.description,
    avatarPlaceholder: `${application.businessName} — AVATAR`,
    bannerPlaceholder: `${application.businessName} — BANNER`,
    location: `${placement.label}, ${placement.city}`,
    area: application.area ?? application.pincode ?? "",
    pincode: application.pincode,
    lat: placement.lat,
    lng: placement.lng,
    deliveryRadiusKm: application.deliveryRadiusKm ?? 10,
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
    specialties: application.specialties?.length ? application.specialties : ["homemade_food"],
    vendorId,
    displayName: application.businessName,
    status: "approved",
    createdAt: new Date().toISOString(),
  };
  sellers.push(seller);

  const decided = await setSellerApplicationStatus(applicationId, "approved");
  return { application: decided ?? application, seller, vendor };
}

/** Same rule as `approveSellerApplication`: a refusal must reach the caller. */
export async function rejectSellerApplication(applicationId: string): Promise<SellerApplication | undefined> {
  if (!isMockMode()) {
    return http.post<SellerApplication>(
      `/admin/sellers/applications/${encodeURIComponent(applicationId)}/reject`,
    );
  }
  return setSellerApplicationStatus(applicationId, "rejected");
}

/**
 * `PATCH /admin/sellers/applications/:id/area` — the way out of the
 * `'other'` waitlist (M19 server-side, M36 client-side).
 *
 * The endpoint has existed since M19 and nothing in the browser called
 * it, so the waitlist was a dead end from the one screen that could fix
 * it: the public form accepts an out-of-area applicant,
 * `approveApplication` refuses any area it cannot resolve, and there was
 * no control anywhere to assign one. A real kitchen sat unapprovable.
 *
 * The server moves the row back to `reviewing`, so it stays in the queue
 * and can be approved immediately afterwards.
 */
export async function assignApplicationArea(
  applicationId: string,
  area: string,
  note?: string,
): Promise<SellerApplication | undefined> {
  if (isMockMode()) {
    return setSellerApplicationArea(applicationId, area);
  }
  return http.patch<SellerApplication>(
    `/admin/sellers/applications/${encodeURIComponent(applicationId)}/area`,
    { area, note },
  );
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
  return http.patch<Seller>(`/admin/sellers/${encodeURIComponent(sellerId)}/status`, { status });
}

/**
 * Everything about one HomeKrafter, for `/admin/sellers/[id]` (M32).
 *
 * Not available in mock mode: it aggregates orders, payouts and reviews
 * across four tables, and a fixture that answers plausibly is worse than
 * one that says it has nothing — a demo run would then show numbers
 * nobody can reconcile with any other screen.
 */
export async function getAdminSellerDetail(sellerId: string): Promise<AdminSellerDetail> {
  return http.get<AdminSellerDetail>(`/admin/sellers/${encodeURIComponent(sellerId)}/detail`);
}

/**
 * The verification panel's read (M16) — includes the submitted FSSAI
 * number, which the public storefront deliberately never publishes.
 */
export async function getAdminSellerProfile(sellerId: string): Promise<AdminSellerProfile | undefined> {
  if (isMockMode()) {
    const seller = sellers.find((s) => s.id === sellerId);
    if (!seller) return undefined;
    const own = getOwnVendorProfile("anjalis-kitchen");
    return {
      ...own,
      sellerId,
      vendorId: seller.vendorId ?? "",
      vendorSlug: "anjalis-kitchen",
      displayName: seller.displayName,
    };
  }
  try {
    return await http.get<AdminSellerProfile>(`/admin/sellers/${encodeURIComponent(sellerId)}/profile`);
  } catch {
    return undefined;
  }
}

/**
 * The only write path to a HomeKrafter's verification badge. A seller
 * cannot set these on themselves — that is what makes the badge worth
 * anything to a buyer — and every change lands in `AdminAuditLog`.
 */
export async function setSellerVerification(
  sellerId: string,
  input: VerificationInput,
): Promise<AdminSellerProfile | undefined> {
  if (isMockMode()) return getAdminSellerProfile(sellerId);
  return http.patch<AdminSellerProfile>(
    `/admin/sellers/${encodeURIComponent(sellerId)}/verification`,
    input,
  );
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
  /**
   * Statuses an admin may override this order to — **server-derived**,
   * and present only on the single-order `summary` response.
   *
   * Sent by the API rather than mirrored here on purpose: the status
   * tables live in `AdminOrdersService`, and a second copy on the client
   * is the `lib/geo.ts` trap — two lists that must stay identical,
   * drifting the first time only one is edited. It also carries a money
   * rule the client must not be able to reverse: `cancelled` and
   * `returned` are absent because the override moves no money, and the
   * server refuses them regardless of what is sent.
   */
  statusOptions?: string[];
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

/** Filters for `GET /admin/orders` — applied server-side in real mode. */
export interface AdminOrdersQuery {
  type?: AdminOrderType;
  q?: string;
  page?: number;
}

export interface AdminOrdersPage {
  items: AdminOrderSummary[];
  page: number;
  pageSize: number;
  total: number;
}

/**
 * One page of the unified order list.
 *
 * The search and the module filter are the **server's** job now. They used
 * to run in the browser over a list containing every order ever placed —
 * which worked, but only because the endpoint had no limit. Filtering a
 * page client-side would quietly turn "search" into "search the twenty-five
 * rows on screen", and an admin looking up a reference would be told the
 * order does not exist.
 */
export async function getAllOrdersUnified(query: AdminOrdersQuery = {}): Promise<AdminOrdersPage> {
  if (!isMockMode()) {
    const params = new URLSearchParams();
    if (query.type) params.set("type", query.type);
    if (query.q) params.set("q", query.q);
    if (query.page && query.page > 1) params.set("page", String(query.page));
    const qs = params.toString();
    return http.get<AdminOrdersPage>(`/admin/orders${qs ? `?${qs}` : ""}`);
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

  const q = query.q?.trim().toLowerCase();
  const items = [...marketplace, ...laundry, ...snacks]
    .filter((o) => !query.type || o.type === query.type)
    .filter(
      (o) =>
        !q ||
        o.reference.toLowerCase().includes(q) ||
        o.customerName.toLowerCase().includes(q) ||
        o.sellerNames.some((name) => name.toLowerCase().includes(q)),
    )
    .sort((a, b) => new Date(b.placedAt).getTime() - new Date(a.placedAt).getTime());

  // Mock mode filters the seeded set in one page — it exists for offline
  // frontend work, and paging a fixture teaches nothing the real path
  // does not. The shape matches so no caller needs a branch.
  return { items, page: 1, pageSize: items.length, total: items.length };
}

/**
 * The one summary row matching a `/admin/orders/[type]/[id]` route.
 *
 * **This used to resolve out of the unified list, and that was a bug.**
 * `getAllOrdersUnified({ type })` returns page 1 — 25 rows per source —
 * so an order with 25 newer siblings simply was not in it, and the detail
 * screen rendered "Order not found." for a record `GET
 * /admin/orders/marketplace/:id` returns without complaint. Because the
 * refund control lives on that screen, the practical effect was that an
 * admin could not refund an order once the queue had moved past it.
 *
 * Same shape of defect as `8298b4b` (`/admin/catalog/[id]` resolving a
 * listing out of the *public* catalogue), same shape of fix: ask the
 * server for the one row instead of paging a list and hoping.
 */
export async function getAdminOrderById(type: AdminOrderType, id: string): Promise<AdminOrderSummary | undefined> {
  if (!isMockMode()) {
    try {
      return await http.get<AdminOrderSummary>(
        `/admin/orders/${encodeURIComponent(type)}/${encodeURIComponent(id)}/summary`,
      );
    } catch (error) {
      // A genuine 404 is "no such order" and the caller renders its own
      // empty state; anything else is a real failure and must surface
      // rather than being flattened into "not found".
      if (error instanceof ApiError && error.status === 404) return undefined;
      throw error;
    }
  }

  const { items } = await getAllOrdersUnified({ type });
  return items.find((o) => o.id === `${type}:${id}`);
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
  /** Total approved HomeKrafters — the real headcount. */
  activeHomeKraftersCount: number;
  /** Per-specialty counts. Overlapping by design: one HomeKrafter with
   *  three specialties appears in all three. */
  activeBySpecialty: Partial<Record<SellerSpecialty, number>>;
  usersCount: number;
  pendingApplicationsCount: number;
  /**
   * Moderation SLA (M27) — when the longest-waiting item arrived, or
   * `undefined` when that queue is clear.
   *
   * The count says whether there is a queue; the age says whether anyone
   * is being left waiting, which is the question that matters while the
   * platform is still recruiting kitchens. A five-day-old application is
   * a supply problem wearing a backlog's clothes.
   */
  oldestPendingApplicationAt?: string;
  pendingListingsCount?: number;
  oldestPendingListingAt?: string;
  pendingPayoutsAmount: number;
  /** Real mode: server-side `Wallet.balance` aggregate (`server/src/admin/dashboard.service.ts`). Mock mode: sum of every seeded `Wallet` balance (`adminWalletsByUser`). */
  walletLiability: number;
}

export async function getAdminDashboard(): Promise<AdminDashboardSnapshot> {
  if (!isMockMode()) {
    return http.get<AdminDashboardSnapshot>("/admin/dashboard");
  }

  // Mock mode only — the real dashboard is SQL aggregates server-side.
  const { items: unified } = await getAllOrdersUnified();
  const today = new Date().toISOString().slice(0, 10);

  const gmvTotal = unified.reduce((sum, o) => sum + o.total, 0);
  const ordersTodayCount = unified.filter((o) => o.placedAt.slice(0, 10) === today).length;

  const ordersByType: Record<AdminOrderType, number> = { marketplace: 0, laundry: 0, snack: 0 };
  for (const order of unified) ordersByType[order.type] += 1;

  // Specialties overlap by design — a HomeKrafter with three is counted in
  // all three, so these sum to more than the headcount below.
  const activeBySpecialty: Partial<Record<SellerSpecialty, number>> = {};
  let activeHomeKraftersCount = 0;
  for (const seller of sellers) {
    if (seller.status !== "approved") continue;
    activeHomeKraftersCount += 1;
    for (const specialty of seller.specialties) {
      activeBySpecialty[specialty] = (activeBySpecialty[specialty] ?? 0) + 1;
    }
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
    activeHomeKraftersCount,
    activeBySpecialty,
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

/** Filters for `GET /admin/catalog/products` — applied server-side in real mode. */
export interface AdminCatalogQuery {
  status?: ProductModerationStatus | "featured";
  vendorId?: string;
  q?: string;
  page?: number;
}

export interface AdminCatalogPage {
  items: AdminProductSummary[];
  page: number;
  pageSize: number;
  total: number;
  /**
   * Listings waiting for review across the whole platform — deliberately
   * not narrowed by the filter or the page. A queue badge reading zero
   * because the admin happens to be looking at "hidden" is worse than no
   * badge, and there is a HomeKrafter's income behind the number.
   */
  pendingCount: number;
}

/**
 * One page of the catalogue.
 *
 * This fetched **every listing on the platform with its relations** so the
 * screen could filter the array. The status, vendor and search filters
 * moved to the server with the pagination — the review queue is the one
 * list where "search only what is on screen" would mean a HomeKrafter
 * waiting because their listing was on page 3.
 */
export async function getAllProductsAdmin(query: AdminCatalogQuery = {}): Promise<AdminCatalogPage> {
  if (!isMockMode()) {
    const params = new URLSearchParams();
    if (query.status) params.set("status", query.status);
    if (query.vendorId) params.set("vendorId", query.vendorId);
    if (query.q) params.set("q", query.q);
    if (query.page && query.page > 1) params.set("page", String(query.page));
    const qs = params.toString();
    return http.get<AdminCatalogPage>(`/admin/catalog/products${qs ? `?${qs}` : ""}`);
  }

  const q = query.q?.trim().toLowerCase();
  const all = products.map((product) => ({
    ...product,
    vendorName: getVendorById(product.vendorId)?.name ?? "Unknown vendor",
    categoryName: getCategoryById(product.categoryId)?.name ?? "Uncategorised",
  }));
  const items = all
    .filter((p) => !query.vendorId || p.vendorId === query.vendorId)
    .filter((p) =>
      !query.status
        ? true
        : query.status === "featured"
          ? !!p.featured
          : (p.moderationStatus ?? "active") === query.status,
    )
    .filter(
      (p) =>
        !q ||
        p.name.toLowerCase().includes(q) ||
        p.vendorName.toLowerCase().includes(q) ||
        p.categoryName.toLowerCase().includes(q),
    );

  return {
    items,
    page: 1,
    pageSize: items.length,
    total: items.length,
    pendingCount: all.filter((p) => (p.moderationStatus ?? "active") === "pending").length,
  };
}

/**
 * M22 added `reject`. `approve` now means both "allow this new listing"
 * and "put this hidden one back" — the server resolves either to `active`,
 * so the client does not need to know which it was.
 */
export type ProductModerationAction =
  | "approve"
  | "reject"
  | "hide"
  | "flag"
  | "feature"
  | "unfeature";

const MODERATION_STATUS_BY_ACTION: Partial<Record<ProductModerationAction, ProductModerationStatus>> = {
  approve: "active",
  reject: "rejected",
  hide: "hidden",
  flag: "flagged",
};

/**
 * Client action → server DTO action.
 *
 * `approve` maps to the server's `approve`, which handles a pending
 * listing *and* restores a hidden one. It used to map to `unhide`, from
 * when `pending` did not exist and "approve" could only mean "undo a
 * takedown".
 */
const SERVER_MODERATION_ACTION: Record<ProductModerationAction, string> = {
  approve: "approve",
  reject: "reject",
  hide: "hide",
  flag: "flag",
  feature: "feature",
  unfeature: "unfeature",
};

/**
 * `GET /admin/catalog/products/:id` — one listing, resolved **unfiltered**.
 *
 * **Why this exists rather than reusing `getProductById`.** That helper
 * resolves a listing out of the *public* catalogue (`getProducts()`),
 * which since M22 filters on `PUBLICLY_LISTED`. A `pending` or `rejected`
 * listing is not in it — so the admin editor rendered "Product not
 * found." for exactly the listings the review gate exists to review. The
 * list screen linked to a detail page that could not open. Found on the
 * deployed site by creating a listing and clicking through to it.
 *
 * The server side already did the right thing: its handler is a plain
 * `findUnique` with no moderation predicate. Only the client was reaching
 * for the wrong door.
 *
 * It also stops downloading the entire catalogue to find one row, which
 * is what the old path did.
 */
export async function getAdminProductById(id: string): Promise<AdminProductSummary | undefined> {
  if (!isMockMode()) {
    try {
      return await http.get<AdminProductSummary>(
        `/admin/catalog/products/${encodeURIComponent(id)}`,
      );
    } catch (error) {
      // A genuine 404 is "no such listing" and the caller renders its own
      // empty state; anything else is a real failure and should surface.
      if (error instanceof ApiError && error.status === 404) return undefined;
      throw error;
    }
  }

  const product = getProductById(id);
  if (!product) return undefined;
  return {
    ...product,
    vendorName: getVendorById(product.vendorId)?.name ?? "Unknown vendor",
    categoryName: getCategoryById(product.categoryId)?.name ?? "Uncategorised",
  };
}

/**
 * One item waiting for review, of any catalogue kind (M28).
 *
 * **Why a unified queue exists.** M22 put the review gate on products,
 * menu items *and* meal plans, but the admin side was built for products
 * alone: `/admin/catalog` reads products, and the only moderate endpoint
 * was the product one. So a snack created after M22 sat `pending` forever,
 * filtered out of every buyer-facing query, with no screen listing it and
 * no endpoint able to approve it. Found on the live site 2026-08-10.
 */
export interface ReviewQueueItem {
  kind: "product" | "snack" | "mealPlan";
  id: string;
  name: string;
  /** Vendor name for a product or plan, HomeKrafter name for a menu item. */
  makerName: string;
  submittedAt: string;
  imageSrc?: string;
  /** Only products have an admin detail screen today. */
  editHref?: string;
}

export interface ReviewQueue {
  items: ReviewQueueItem[];
  total: number;
  counts: { product: number; snack: number; mealPlan: number };
}

/** What each kind is called on screen. An operator should not have to infer it. */
export const REVIEW_KIND_LABEL: Record<ReviewQueueItem["kind"], string> = {
  product: "Listing",
  snack: "Menu item",
  mealPlan: "Meal plan",
};

export async function getReviewQueue(): Promise<ReviewQueue> {
  if (!isMockMode()) {
    return await http.get<ReviewQueue>("/admin/catalog/queue");
  }
  const pending = products.filter((p) => p.moderationStatus === "pending");
  return {
    items: pending.map((p) => ({
      kind: "product" as const,
      id: p.id,
      name: p.name,
      makerName: "Mock vendor",
      submittedAt: new Date().toISOString(),
      editHref: `/admin/catalog/${p.id}`,
    })),
    total: pending.length,
    counts: { product: pending.length, snack: 0, mealPlan: 0 },
  };
}

/**
 * A decision on a menu item or a meal plan.
 *
 * Separate paths rather than one `:type/:id` route because the product
 * route already ships in a released client, and moving a live request path
 * breaks native clients that cannot be redeployed in step (M27).
 */
export async function moderateCatalogItem(
  kind: ReviewQueueItem["kind"],
  id: string,
  action: ProductModerationAction,
  reason?: string,
): Promise<void> {
  if (kind === "product") {
    await moderateProduct(id, action, reason);
    return;
  }
  if (isMockMode()) return;
  const path = kind === "snack" ? "snacks" : "meal-plans";
  // Not wrapped in try/catch, same reason as `moderateProduct`: a refusal
  // for want of a reason must not look like a silent no-op.
  await http.patch(`/admin/catalog/${path}/${encodeURIComponent(id)}/moderate`, {
    action: SERVER_MODERATION_ACTION[action],
    ...(reason ? { reason } : {}),
  });
}

/** The actions the server refuses without a reason — see `ModerateProductDto`. */
export const MODERATION_ACTIONS_NEEDING_REASON: ProductModerationAction[] = ["reject", "hide", "flag"];

export async function moderateProduct(
  productId: string,
  action: ProductModerationAction,
  reason?: string,
): Promise<Product | undefined> {
  if (!isMockMode()) {
    // Deliberately **not** wrapped in `try/catch` any more. It used to
    // swallow every failure and return `undefined`, which the caller
    // rendered as "nothing happened" — so the server refusing a rejection
    // for want of a reason would look identical to a silent no-op. The
    // caller now shows the message.
    return await http.patch<AdminProductSummary>(
      `/admin/catalog/products/${encodeURIComponent(productId)}/moderate`,
      { action: SERVER_MODERATION_ACTION[action], ...(reason ? { reason } : {}) },
    );
  }

  const product = products.find((p) => p.id === productId);
  if (!product) return undefined;

  const nextStatus = MODERATION_STATUS_BY_ACTION[action];
  if (nextStatus) {
    product.moderationStatus = nextStatus;
    product.moderationNote = reason || undefined;
  }
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
  product.kind = input.kind;
  product.shippingScope = input.shippingScope;
  product.isSnack = input.isSnack;
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
    return http.patch<Review>(`/admin/catalog/reviews/${encodeURIComponent(reviewId)}/moderate`, { hidden });
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
  /**
   * Platform-wide, and deliberately **not** narrowed by the page. A "total
   * liability" that only totalled the wallets on screen would be a money
   * figure quietly meaning something else.
   */
  totalLiability: number;
  walletCount: number;
  totalLifetimeSaved: number;
  /** One page of wallets, highest balance first. */
  balances: AdminWalletUserSummary[];
  page: number;
  pageSize: number;
  total: number;
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

export async function getWalletOverview(page = 1): Promise<AdminWalletOverview> {
  if (!isMockMode()) {
    return http.get<AdminWalletOverview>(`/admin/wallet${page > 1 ? `?page=${page}` : ""}`);
  }

  const balances = Object.keys(adminWalletsByUser)
    .map(walletUserSummary)
    .sort((a, b) => b.balance - a.balance);

  return {
    totalLiability: balances.reduce((sum, b) => sum + b.balance, 0),
    walletCount: balances.length,
    totalLifetimeSaved: balances.reduce((sum, b) => sum + b.lifetimeSaved, 0),
    balances,
    // Mock mode is the seeded fixture set in one page — it exists for
    // offline frontend work, and paging a fixture teaches nothing the real
    // path does not. The shape matches so no caller needs a branch.
    page: 1,
    pageSize: balances.length,
    total: balances.length,
  };
}

export interface AdminUserWallet {
  wallet: Wallet;
  transactions: WalletTransaction[];
  /** `null` on the last page. Cursor, not offset — a ledger grows at the end being read from. */
  nextCursor: string | null;
}

export async function getUserWallet(
  userId: string,
  cursor?: string,
): Promise<AdminUserWallet | undefined> {
  if (!isMockMode()) {
    try {
      const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
      return await http.get<AdminUserWallet>(
        `/admin/wallet/${encodeURIComponent(userId)}${query}`,
      );
    } catch {
      return undefined;
    }
  }
  const w = adminWalletsByUser[userId];
  if (!w) return undefined;
  return {
    wallet: w,
    transactions: adminWalletTransactionsByUser[userId] ?? [],
    nextCursor: null,
  };
}

function genWalletTxnId(): string {
  return `wt-adm-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export interface RefundOrderResult {
  /** What was credited back, in rupees — the order/booking total. */
  amount: number;
}

/**
 * Refund one order or booking — `POST /admin/orders/:type/:id/refund`.
 *
 * **This is not the same as crediting the wallet by hand, and the
 * difference is the whole point.** `/admin/orders/[type]/[id]` used to
 * refund through `issueRefund` (a raw `POST /admin/wallet/:userId/refund`
 * with an operator-typed amount and no idempotency key). That path:
 *
 * - never set `Order.refundStatus`, so the same order could be refunded
 *   again tomorrow with nothing on the screen saying it already had been;
 * - sent no `Idempotency-Key`, so a retry after a timeout credited twice
 *   — the exact failure M23 found on "Place order" and fixed for the
 *   buyer's side only;
 * - wrote the ledger row against `refId: orderNumber` while every other
 *   refund writes the record's `id`, so the two could not be joined;
 * - could not refuse to refund an order that was never paid.
 *
 * The purpose-built endpoint does all four. It refunds the full total by
 * design — a partial adjustment is a different act with a different
 * reason, and it has its own screen at `/admin/wallet/[userId]`, which is
 * the path `CLAUDE.md` already documents for resolving a return.
 */
export async function refundAdminOrder(
  type: AdminOrderType,
  id: string,
  idempotencyKey?: string,
): Promise<RefundOrderResult> {
  if (isMockMode()) {
    // Offline frontend work still needs the button to do something
    // visible. The mock ledger is the same one `issueRefund` writes to.
    const summary = await getAdminOrderById(type, id);
    if (!summary?.customerUserId) throw new Error("No wallet to refund.");
    const txn = await issueRefund({
      userId: summary.customerUserId,
      amount: summary.total,
      title: `Refund — Order #${summary.reference}`,
      refType: type === "marketplace" ? "order" : "laundryBooking",
      refId: id,
    });
    if (!txn) throw new Error("Couldn't issue that refund.");
    return { amount: summary.total };
  }

  const result = await http.post<{ total?: number; estimatedTotal?: number }>(
    `/admin/orders/${encodeURIComponent(type)}/${encodeURIComponent(id)}/refund`,
    undefined,
    { idempotencyKey },
  );
  return { amount: Number(result.total ?? result.estimatedTotal ?? 0) };
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
    } catch (err) {
      // **Only** the documented case. This used to be a bare `catch`, so
      // the "insufficient balance is not an exception" contract above was
      // also quietly absorbing every other refusal — a malformed amount, a
      // suspended wallet, a 500 — and handing the admin the same silent
      // `undefined`. A rejected debit is an outcome; everything else is an
      // error and belongs to the caller.
      if (err instanceof ApiError && err.status === 402) return undefined;
      throw err;
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
  /** Order matters — this is display order on `/guides/[slug]` and `/collections/[occasion]`, so reordering (move up/down in the admin editor) is just re-submitting this array in the new order. */
  productIds: string[];
  // M16 (H8) — a collection is a browsable gift guide now, so it carries
  // its own art and its own place in the merchandiser's running order.
  imageSrc?: string;
  featured?: boolean;
  sortOrder?: number;
}

export async function upsertCollection(input: UpsertCollectionInput): Promise<Collection> {
  if (!isMockMode()) {
    const body = {
      title: input.title,
      description: input.description,
      occasionId: input.occasionId,
      productIds: input.productIds,
      imageSrc: input.imageSrc,
      featured: input.featured,
      sortOrder: input.sortOrder,
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
      existing.imageSrc = input.imageSrc;
      existing.featured = input.featured;
      existing.sortOrder = input.sortOrder;
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
    imageSrc: input.imageSrc,
    featured: input.featured ?? false,
    sortOrder: input.sortOrder ?? 0,
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
// ---------------------------------------------------------------------------
// Platform settings + exports (M16, M5)
// ---------------------------------------------------------------------------

export interface PlatformSettings {
  /**
   * The take rate. Deducted from payouts only while `commissionEnabled`
   * is on (M37); off, it drives the modelled commission line on
   * analytics and the estimates on the seller's payout screen and
   * listing form.
   */
  commissionPct: number;
  /**
   * Whether payouts actually deduct the rate above (M37). Defaults off —
   * flipping it is a business decision, and every screen says which mode
   * it is in.
   */
  commissionEnabled: boolean;
  /** Given to a new HomeKrafter whose application didn't state one. */
  defaultDeliveryRadiusKm: number;
  /**
   * Where Homekrafted currently *delivers*, as comma-separated pincode
   * prefixes — `"160,1401,1403,1341,1346"` is the Chandigarh tricity
   * (M36).
   *
   * **Buyer-facing only.** It selects copy, never visibility: someone
   * outside it still sees the whole catalogue and is simply told we do
   * not deliver there yet. It must never gate an application, an
   * approval, or a HomeKrafter's portal — supply is national, and the
   * moment this decides who may sell, the pre-M36 waitlist is back under
   * a new name. An empty value means no gate at all.
   */
  servicedPincodePrefixes: string;
  /**
   * When a delivery date's meal menu (and a buyer's skip of it) closes:
   * this time IST the evening before (M37). "20:00" means Tuesday's
   * tiffin locks Monday 8pm.
   */
  menuLockTime: string;
}

export async function getPlatformSettings(): Promise<PlatformSettings | undefined> {
  if (isMockMode())
    return {
      commissionPct: 10,
      commissionEnabled: false,
      defaultDeliveryRadiusKm: 10,
      servicedPincodePrefixes: "160,1401,1403,1341,1346",
      menuLockTime: "20:00",
    };
  try {
    return await http.get<PlatformSettings>("/admin/settings");
  } catch {
    return undefined;
  }
}

export async function updatePlatformSettings(
  patch: Partial<PlatformSettings>,
): Promise<PlatformSettings | undefined> {
  if (isMockMode())
      return {
        commissionPct: 10,
        commissionEnabled: false,
        defaultDeliveryRadiusKm: 10,
        servicedPincodePrefixes: "160,1401,1403,1341,1346",
        menuLockTime: "20:00",
        ...patch,
      };
  return http.patch<PlatformSettings>("/admin/settings", patch);
}

export type AdminExportKind = "orders" | "sellers" | "payouts";

/**
 * The CSV is built and escaped **server-side** (`AdminExportsService`),
 * so this is a plain authenticated download rather than a fetch the
 * client turns into a Blob — one place owns the escaping and the
 * spreadsheet-formula guard.
 */
export function adminExportUrl(kind: AdminExportKind, days?: number): string {
  const base = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api/v1").replace(/\/$/, "");
  const query = days ? `?days=${encodeURIComponent(days)}` : "";
  return `${base}/admin/exports/${kind}${query}`;
}

export async function getOccasionsAdmin(): Promise<Occasion[]> {
  if (!isMockMode()) return getOccasions();
  return occasions;
}

/**
 * Seasonal metadata for the occasion hub (M16, H8).
 *
 * `celebratedOn` is an absolute date, not a recurrence rule — Diwali,
 * Raksha Bandhan and Karwa Chauth are lunisolar and move against the
 * Gregorian calendar every year, so somebody rolls these forward
 * annually, and that somebody is an admin on this screen rather than a
 * cron job guessing at a calendar it doesn't understand.
 *
 * `clearCelebratedOn` exists because an omitted optional field means
 * "leave it alone" everywhere else here, and an occasion that has passed
 * needs a route back to evergreen without inventing a sentinel date.
 */
export interface UpdateOccasionInput {
  celebratedOn?: string;
  clearCelebratedOn?: boolean;
  tagline?: string;
  imageSrc?: string;
}

export async function updateOccasion(
  id: string,
  input: UpdateOccasionInput,
): Promise<Occasion | undefined> {
  if (isMockMode()) {
    const occasion = occasions.find((o) => o.id === id);
    if (!occasion) return undefined;
    if (input.clearCelebratedOn) occasion.celebratedOn = undefined;
    else if (input.celebratedOn) occasion.celebratedOn = input.celebratedOn;
    if (input.tagline !== undefined) occasion.tagline = input.tagline;
    if (input.imageSrc !== undefined) occasion.imageSrc = input.imageSrc;
    return occasion;
  }
  return http.patch<Occasion>(
    `/admin/collections/occasions/${encodeURIComponent(id)}`,
    input,
  );
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
  type: AdminOrderType;
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
  /** Days in the window, echoed back by the server (M16) so the client labels the range it got. */
  days: number;
  /**
   * The configured take rate, and what it would have earned on this
   * window's GMV. **Nothing deducts it** — payouts are gross and
   * settlement is manual — so the screen rendering it says so. It exists
   * because "what would 12% have earned" has to be answerable before the
   * business can set a rate.
   */
  commissionPct: number;
  modelledCommission: number;
  /** Oldest first, `days` long. */
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
  // Mock mode only — the real series is a grouped SQL query server-side.
  const { items: unified } = await getAllOrdersUnified();
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
  function addRevenue(key: string, name: string, type: AdminOrderType, amount: number) {
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
      addRevenue(`vendor:${vendorId}`, vendor.name, "marketplace", amount);
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

export async function getAnalytics(days = 14): Promise<AdminAnalyticsSnapshot> {
  if (!isMockMode()) {
    return http.get<AdminAnalyticsSnapshot>(`/admin/analytics?days=${encodeURIComponent(days)}`);
  }

  const [gmvSeries, sellerLeaderboard, productLeaderboard, dashboard] = await Promise.all([
    computeGmvSeries(),
    computeSellerLeaderboard(),
    computeProductLeaderboard(),
    getAdminDashboard(),
  ]);

  return {
    days: 14,
    commissionPct: 10,
    modelledCommission:
      Math.round(gmvSeries.reduce((sum, p) => sum + p.gmv, 0) * 0.1 * 100) / 100,
    gmvSeries,
    ordersByType: dashboard.ordersByType,
    topSellers: sellerLeaderboard.slice(0, 6),
    topProducts: productLeaderboard.slice(0, 6),
    newUsersByMonth: computeNewUsersByMonth(),
    walletFlow: computeWalletFlow(),
  };
}

// ---------------------------------------------------------------------
// Payouts (M15)
//
// The other end of `/seller/payouts`. Between M8.3b and M15 a HomeKrafter
// could request a payout and nothing on the platform could act on it —
// no admin endpoint, no screen, no transition out of `pending`. Earnings
// accrued and had no way to leave.
//
// Mock-only, deliberately: there is no mock payout store to mutate (the
// seller-side mock array lives in `lib/data/sellers.ts` and isn't keyed
// for cross-account admin access), and inventing one would let the
// offline build claim a settlement the real path can't. Mock mode returns
// an empty queue.
// ---------------------------------------------------------------------

export interface AdminPayout {
  id: ID;
  sellerId: ID;
  sellerName: string;
  vendorName: string;
  sellerEmail?: string;
  sellerPhone?: string;
  amount: number;
  /**
   * The row's own arithmetic (M37); absent on pre-M37 rows, where
   * `amount` was always gross — the queue must not invent a split for
   * those.
   */
  grossAmount?: number;
  commissionAmount?: number;
  commissionPct?: number;
  periodStart: string;
  periodEnd: string;
  status: PayoutStatus;
  paidAt?: string;
  reference?: string;
  note?: string;
  decidedByName?: string;
  decidedAt?: string;
}

export interface AdminPayoutQueue {
  items: AdminPayout[];
  page: number;
  pageSize: number;
  total: number;
  /**
   * Every payout, **never** the page or the filter. Reduced over the
   * loaded rows this reported nothing pending the moment an admin clicked
   * "Paid" — on the one screen that decides who gets paid.
   */
  summary: { pendingCount: number; pendingTotal: number; paidTotal: number };
}

export async function getAdminPayouts(
  status?: PayoutStatus,
  page = 1,
): Promise<AdminPayoutQueue> {
  if (isMockMode()) {
    return {
      items: [],
      page: 1,
      pageSize: 0,
      total: 0,
      summary: { pendingCount: 0, pendingTotal: 0, paidTotal: 0 },
    };
  }
  const query: Record<string, string> = {};
  if (status) query.status = status;
  if (page > 1) query.page = String(page);
  return http.get<AdminPayoutQueue>("/admin/payouts", {
    query: Object.keys(query).length ? query : undefined,
  });
}

/**
 * Records a settlement — it does **not** move money. There is no
 * payout-provider integration; an admin transfers out of band and puts
 * the bank reference here, which is the only link between this row and a
 * real transfer.
 */
export async function markPayoutPaid(
  payoutId: string,
  reference?: string,
  note?: string,
): Promise<AdminPayout> {
  return http.post<AdminPayout>(`/admin/payouts/${encodeURIComponent(payoutId)}/pay`, {
    reference,
    note,
  });
}

/** `note` is required — a payout refused with no explanation is worse than one that never happened. */
export async function rejectPayout(payoutId: string, note: string): Promise<AdminPayout> {
  return http.post<AdminPayout>(`/admin/payouts/${encodeURIComponent(payoutId)}/reject`, { note });
}

// ---------------------------------------------------------------------
// Support / disputes (M15)
//
// The missing reader for tickets the `/support` form has been writing
// since M7b. `SupportService.addMessage` had a comment reserving
// `sender: "agent"` for "the M11 support-queue surface, not built yet" —
// it was never built, so tickets were written and nothing could read
// them.
//
// Mock-only returns an empty queue: `lib/api/support.ts`'s mock ticket
// store is a per-session array scoped to the current shopper, so there is
// nothing cross-account for an offline admin view to show, and faking one
// would let the offline build claim a dispute flow the real path owns.
// ---------------------------------------------------------------------

export interface AdminSupportTicket extends SupportTicket {
  userName: string;
  userEmail?: string;
  userPhone?: string;
  lastMessageAt: string;
  /** The newest message came from the customer — it's our turn. */
  awaitingReply: boolean;
}

export interface AdminSupportQueue {
  items: AdminSupportTicket[];
  page: number;
  pageSize: number;
  total: number;
  /**
   * Queue-wide counts, **never narrowed by the status filter or the
   * page**. They used to be derived from whatever rows were loaded, so
   * clicking "Resolved" made the header say nobody was waiting — on the
   * one screen whose entire job is telling an admin who is.
   */
  summary: { open: number; inProgress: number; awaitingReply: number };
}

export async function getAdminSupportTickets(
  status?: SupportTicketStatus,
  page?: number,
): Promise<AdminSupportQueue> {
  if (isMockMode()) {
    return { items: [], page: 1, pageSize: 0, total: 0, summary: { open: 0, inProgress: 0, awaitingReply: 0 } };
  }
  const query: Record<string, string> = {};
  if (status) query.status = status;
  if (page && page > 1) query.page = String(page);
  return http.get<AdminSupportQueue>("/admin/support/tickets", {
    query: Object.keys(query).length ? query : undefined,
  });
}

/** Posts as `agent`, and moves an `open` ticket to `in-progress` server-side — a ticket someone has answered isn't still untouched. */
export async function replyToSupportTicket(
  ticketId: string,
  body: string,
): Promise<AdminSupportTicket> {
  return http.post<AdminSupportTicket>(
    `/admin/support/tickets/${encodeURIComponent(ticketId)}/messages`,
    { body },
  );
}

export async function setSupportTicketStatus(
  ticketId: string,
  status: SupportTicketStatus,
): Promise<AdminSupportTicket> {
  return http.patch<AdminSupportTicket>(
    `/admin/support/tickets/${encodeURIComponent(ticketId)}/status`,
    { status },
  );
}

/**
 * `PATCH /admin/orders/:type/:id/status` — record a corrected status.
 *
 * **It records; it does not settle.** The server refuses `cancelled` and
 * `returned` outright, because this path moves no money: the real cancel
 * refunds the wallet, restocks the lines and reverses the cashback in one
 * transaction, and an override that only wrote the word "cancelled" would
 * tell a customer they had been refunded when nothing had moved. The UI
 * never offers those two either (they are absent from `statusOptions`),
 * so this is belt and braces — deliberately.
 *
 * `expectedStatus` makes it a compare-and-set: pass what the screen was
 * showing and a second admin who got there first produces a 409 rather
 * than a silent overwrite plus a duplicate notification to the buyer.
 */
export async function overrideAdminOrderStatus(
  type: AdminOrderType,
  id: string,
  status: string,
  expectedStatus?: string,
): Promise<void> {
  if (isMockMode()) return;
  await http.patch(
    `/admin/orders/${encodeURIComponent(type)}/${encodeURIComponent(id)}/status`,
    { status, expectedStatus },
  );
}

/** One row of the admin audit trail. */
export interface AdminAuditEntry {
  id: string;
  actorId: string;
  actorName: string;
  actorEmail?: string;
  /** Raw slug, e.g. `order.status_override`. Rendered verbatim — see `AuditClient`. */
  action: string;
  targetType: string;
  targetId?: string;
  /** Shape differs per action; rendered as a generic key/value grid, never per-action. */
  metadata?: Record<string, unknown>;
  createdAt: string;
}

export interface AdminAuditPage {
  items: AdminAuditEntry[];
  page: number;
  pageSize: number;
  total: number;
  /** Distinct entity kinds present in the log — the filter's options, served rather than hardcoded. */
  targetTypes: string[];
}

/**
 * `GET /admin/audit` — every admin mutation, newest first.
 *
 * **The filters here are exactly what the endpoint supports**, which is
 * entity kind and actor. Not action, and not a date range: filtering
 * those in the browser would only narrow the fifty rows already fetched,
 * so "last week" would silently miss everything on page two. A filter
 * that lies is worse than no filter on the one screen whose whole job is
 * being complete.
 */
export async function getAdminAuditLog(params: {
  targetType?: string;
  actorId?: string;
  page?: number;
  pageSize?: number;
} = {}): Promise<AdminAuditPage> {
  if (isMockMode()) {
    return { items: [], page: 1, pageSize: 50, total: 0, targetTypes: [] };
  }
  const query = new URLSearchParams();
  if (params.targetType) query.set("targetType", params.targetType);
  if (params.actorId) query.set("actorId", params.actorId);
  if (params.page) query.set("page", String(params.page));
  if (params.pageSize) query.set("pageSize", String(params.pageSize));
  const suffix = query.toString() ? `?${query}` : "";
  return http.get<AdminAuditPage>(`/admin/audit${suffix}`);
}
