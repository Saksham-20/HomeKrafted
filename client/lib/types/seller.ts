/**
 * Seller-portal types (M10a) — shared by every seller type (`maker` now,
 * `laundry`/`snack` land in M10b) and by M11's admin approval queue.
 * `Seller` is the role-scoping record `lib/api/seller.ts` filters every
 * query through (`vendorId` for a maker); `Payout` is that seller's
 * earnings-settlement ledger. Both become real Prisma tables at M8 — see
 * `docs/DATA-MODEL.md` for the mapping and the server-side enforcement
 * note (owner-scoping is simulated client-side today, enforced for real
 * once a session exists).
 */

import type { ID, ISODateString } from "./shared";

/** M10a builds `maker` only; `laundry`/`snack` are M10b's route + nav sets. */
export type SellerType = "maker" | "laundry" | "snack";

export type SellerStatus = "pending" | "approved" | "suspended";

export interface Seller {
  id: ID;
  userId: ID;
  type: SellerType;
  /** Set for `type: "maker"` — the `Vendor` this seller manages. */
  vendorId?: ID;
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
}

/**
 * M10b: `LaundryBooking.partnerId` and `Snack.sellerId`/`SnackOrder.sellerId`
 * all reference `Seller.id` directly (not a separate "partner profile" or
 * "vendor" entity) — the simplest scoping key that already exists on this
 * type, reused the same way `Payout.sellerId` already does.
 */

export type PayoutStatus = "pending" | "paid";

export interface Payout {
  id: ID;
  sellerId: ID;
  amount: number;
  periodStart: ISODateString;
  periodEnd: ISODateString;
  status: PayoutStatus;
  paidAt?: ISODateString;
}
