/**
 * HomeKrafter-portal types. One supply-side role: every HomeKrafter has a
 * storefront (`vendorId`) and every portal module, and `specialties` only
 * describes what they make. `Seller` is the owner-scoping record
 * `lib/api/seller.ts` filters every query through; `Payout` is their
 * earnings-settlement ledger. Both become real Prisma tables at M8 — see
 * `docs/DATA-MODEL.md` for the mapping and the server-side enforcement
 * note (owner-scoping is simulated client-side today, enforced for real
 * once a session exists).
 */

import type { ID, ISODateString, SellerSpecialty } from "./shared";

/** M10a builds `maker` only; `laundry`/`snack` are M10b's route + nav sets. */
export type { SellerSpecialty } from "./shared";
export { SPECIALTY_LABELS } from "./shared";

export type SellerStatus = "pending" | "approved" | "suspended";

export interface Seller {
  id: ID;
  userId: ID;
  specialties: SellerSpecialty[];
  /** Every HomeKrafter has a storefront now — this is always set. */
  vendorId: ID;
  displayName: string;
  status: SellerStatus;
  createdAt: ISODateString;
  /**
   * M10b: laundry/snack sellers have no `Vendor` to read a rating off of
   * (that's a maker-only concept), so these two are modeled directly on
   * `Seller` instead — optional since a maker's rating still comes from
   * its `Vendor` record and a brand-new seller of any type starts
   * unrated. Used by the laundry partner dashboard today; available to
   * any type.
   */
  rating?: number;
  reviewCount?: number;
  /**
   * Where this HomeKrafter is between "approved" and "actually using the
   * site", plus the credentials to get them there (M32).
   *
   * Admin surfaces only — `GET /admin/sellers` attaches it; nothing on
   * the buyer side ever sees it.
   */
  signIn?: SellerSignInState;
}

/** The onboarding half of a HomeKrafter's record, as the admin panel reads it (M32). */
export interface SellerSignInState {
  /** `awaiting` — issued details, not yet used. `onboarded` — chose their own password. */
  status: "awaiting" | "onboarded";
  /** What they type in the one sign-in box: their email, or their number if that is all we have. */
  username: string | null;
  /**
   * Present **only** while it is still the account's real password. The
   * server nulls it the moment its owner chooses their own, so this going
   * away is the signal that they have arrived — never a stale secret.
   */
  temporaryPassword: string | null;
  issuedAt?: ISODateString | null;
  claimedAt?: ISODateString | null;
}

/**
 * M10b: `LaundryBooking.partnerId` and `Snack.sellerId`/`SnackOrder.sellerId`
 * all reference `Seller.id` directly (not a separate "partner profile" or
 * "vendor" entity) — the simplest scoping key that already exists on this
 * type, reused the same way `Payout.sellerId` already does.
 */

/**
 * `rejected` arrived with M15's admin payout queue. Before that a request
 * could only ever sit at `pending` — nothing on the platform could settle
 * or refuse one — so refusal had no way to be expressed without deleting
 * the request and losing the record that it was made.
 */
export type PayoutStatus = "pending" | "paid" | "rejected";

export interface Payout {
  id: ID;
  sellerId: ID;
  amount: number;
  periodStart: ISODateString;
  periodEnd: ISODateString;
  status: PayoutStatus;
  paidAt?: ISODateString;
  /**
   * The bank/UPI reference the transfer moved under. Settlement happens
   * outside this system (no payout-provider integration), so this string
   * is the only link between "marked paid" and a real transfer — and it's
   * what a HomeKrafter quotes when it hasn't arrived.
   */
  reference?: string;
  /** Why it was declined, or a note attached when settling. */
  note?: string;
  /** When an admin settled or declined it. */
  decidedAt?: ISODateString;
}

// ---------------------------------------------------------------------------
// Analytics (M16, H6)
//
// Revenue is the HomeKrafter's **line-item share**, never the order total.
// A marketplace order can span several kitchens; crediting each of them
// with the whole order would overstate what a home cook earns and
// disagree with what they are paid out. (The admin GMV figure does use
// whole-order totals — deliberately, as a platform-wide proxy, and it
// says so.)
// ---------------------------------------------------------------------------

export interface SellerDailyPoint {
  date: ISODateString;
  revenue: number;
  orderCount: number;
}

export interface SellerTopItem {
  productId: ID;
  name: string;
  unitsSold: number;
  revenue: number;
}

/** Orders per weekday, 0 = Sunday — the "and when" a home cook plans cooking days around. */
export interface SellerWeekdayPoint {
  weekday: number;
  orderCount: number;
  revenue: number;
}

export interface SellerAnalyticsTotals {
  revenue: number;
  orderCount: number;
  averageOrderValue: number;
  unitsSold: number;
  /**
   * `null` when the comparison window had nothing in it. A percentage
   * change from zero is a division by zero wearing a percent sign, and
   * rendering "+100%" for a kitchen's first-ever order is worse than
   * saying "no earlier period to compare".
   */
  revenueChangePct: number | null;
  orderCountChangePct: number | null;
  /** `null` until there is something to divide — "0% repeat" reads as a verdict on a kitchen that simply hasn't had orders yet. */
  repeatRate: number | null;
  cancellationRate: number | null;
}

export interface SellerAnalytics {
  days: number;
  from: ISODateString;
  to: ISODateString;
  totals: SellerAnalyticsTotals;
  series: SellerDailyPoint[];
  topItems: SellerTopItem[];
  byWeekday: SellerWeekdayPoint[];
}
