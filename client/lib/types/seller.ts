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
