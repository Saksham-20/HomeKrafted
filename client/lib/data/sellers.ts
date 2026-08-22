import type { Payout, Seller, SnackOrder, User } from "@/lib/types";

/**
 * Seller-portal seed data (M10a). The demo maker is "Anjali's Kitchen"
 * (`vd1` in `lib/data/vendors.ts`) — chosen because it's the one vendor
 * whose product (`pr1`, Mango Thokku Pickle) already carries the full
 * product-detail field set (multi-weight pricing, gallery, ingredients),
 * so the Listings screen has something real to show on first load.
 *
 * This is a *separate* `User` from `currentUser` (the consumer shopper,
 * Ananya Iyer) — the plan's role model is "seller = their own account",
 * not a permission a shopper toggles on themselves. `AuthContext`'s
 * `signInAsSeller()` swaps `user` to this record and `role` to `"seller"`.
 */
export const sellerUser: User = {
  id: "user-seller-demo",
  name: "Anjali Reddy",
  email: "anjali@anjaliskitchen.example",
  phone: "+91 98765 43210",
  avatarPlaceholder: "ANJALI — AVATAR",
  authProviders: ["phone", "email"],
  createdAt: "2023-11-02",
  walletId: "wallet-seller-demo",
  loyaltyAccountId: "loyalty-seller-demo",
  referralCode: "ANJALI250",
  role: "seller",
};

/**
 * M10b's two additional demo `User`s — one per new seller type, same
 * "separate `User` from the consumer shopper" reasoning as `sellerUser`
 * above. `AuthContext.signInAsSeller(type)` resolves to whichever of the
 * three this/`sellerUser` matches the requested `type`.
 */
// `laundryPartnerUser` (Ravi Kumar, "Fresh Fold Laundry Co.") left in
// M37 with the withdrawn module's demo sign-in arm — the seed laundry
// bookings keep their dangling `partnerId: "sl2"` because history rows
// referencing a retired partner are exactly the legacy case the module's
// remaining reads exist for.

export const snackSellerUser: User = {
  id: "user-seller-snack-demo",
  name: "Meera Nair",
  email: "meera@meerassnackbox.example",
  phone: "+91 90080 33445",
  avatarPlaceholder: "MEERA — AVATAR",
  authProviders: ["phone", "email"],
  createdAt: "2024-05-20",
  walletId: "wallet-seller-snack-demo",
  loyaltyAccountId: "loyalty-seller-snack-demo",
  referralCode: "MEERA250",
  role: "seller",
};

/**
 * Three seed `Seller`s, one per `SellerType` — `sl1` (maker, M10a) plus
 * M10b's `sl2` (laundry partner, "Fresh Fold Laundry Co.") and `sl3`
 * (snack seller, "Meera's Snack Box"). Laundry/snack have no `vendorId`
 * (that's maker-only — see the type's doc comment); other domain
 * entities scope to them via `Seller.id` directly:
 * `LaundryBooking.partnerId` (`lib/types/laundry.ts`) for `sl2`,
 * `Snack.sellerId`/`SnackOrder.sellerId` (`lib/types/food.ts`) for `sl3`.
 */
export const sellers: Seller[] = [
  {
    id: "sl1",
    userId: sellerUser.id,
    specialties: ["homemade_food", "pickles_preserves"],
    vendorId: "vd1",
    displayName: "Anjali's Kitchen",
    status: "approved",
    createdAt: "2023-11-02",
  },
  {
    id: "sl3",
    userId: snackSellerUser.id,
    specialties: ["snacks", "homemade_food"],
    vendorId: "vd10",
    displayName: "Meera's Snack Box",
    status: "approved",
    createdAt: "2024-05-20",
    rating: 4.5,
    reviewCount: 96,
  },
];

/**
 * Payout history for `sl1` — two settled periods plus the current
 * (2026-07-25 "today") half-month still pending, so `/seller/payouts`
 * has both a paid history and a real "pending" figure to show without
 * any live mutation. `requestSellerPayout` (`lib/api/seller.ts`) appends
 * to a separate in-memory list rather than pushing here, same
 * seed-vs-session-mutation split as `lib/data/orders.ts#seedOrders` vs.
 * `lib/api/orders.ts`'s live `orders` array.
 */
export const payouts: Payout[] = [
  {
    id: "po1",
    sellerId: "sl1",
    amount: 8420,
    periodStart: "2026-06-16",
    periodEnd: "2026-06-30",
    status: "paid",
    paidAt: "2026-07-03",
  },
  {
    id: "po2",
    sellerId: "sl1",
    amount: 9860,
    periodStart: "2026-07-01",
    periodEnd: "2026-07-15",
    status: "paid",
    paidAt: "2026-07-18",
  },
  {
    id: "po3",
    sellerId: "sl1",
    amount: 6210,
    periodStart: "2026-07-16",
    periodEnd: "2026-07-31",
    status: "pending",
  },
  // M10b — same two-settled-plus-one-pending shape for `sl2`/`sl3`, so
  // `/seller/payouts` (reused as-is by both new types) has real history
  // to show regardless of which demo seller is signed in.
  {
    id: "po4",
    sellerId: "sl2",
    amount: 11340,
    periodStart: "2026-06-16",
    periodEnd: "2026-06-30",
    status: "paid",
    paidAt: "2026-07-03",
  },
  {
    id: "po5",
    sellerId: "sl2",
    amount: 12980,
    periodStart: "2026-07-01",
    periodEnd: "2026-07-15",
    status: "paid",
    paidAt: "2026-07-18",
  },
  {
    id: "po6",
    sellerId: "sl2",
    amount: 5460,
    periodStart: "2026-07-16",
    periodEnd: "2026-07-31",
    status: "pending",
  },
  {
    id: "po7",
    sellerId: "sl3",
    amount: 4180,
    periodStart: "2026-06-16",
    periodEnd: "2026-06-30",
    status: "paid",
    paidAt: "2026-07-03",
  },
  {
    id: "po8",
    sellerId: "sl3",
    amount: 5020,
    periodStart: "2026-07-01",
    periodEnd: "2026-07-15",
    status: "paid",
    paidAt: "2026-07-18",
  },
  {
    id: "po9",
    sellerId: "sl3",
    amount: 2340,
    periodStart: "2026-07-16",
    periodEnd: "2026-07-31",
    status: "pending",
  },
];

/**
 * M10b — seed `SnackOrder`s for `sl3`, spanning all 4 `SnackOrderStatus`
 * values so `/seller/orders` (snack type) and its status-advance action
 * have something at every stage. Line items reference real
 * `lib/data/snacks.ts` snacks/prices. See `SnackOrder`'s doc comment
 * (`lib/types/food.ts`) — these stand in for what M9's real WhatsApp
 * Cloud API ingestion would create from an actual inbound order.
 */
export const seedSnackOrders: SnackOrder[] = [
  {
    id: "sko1",
    sellerId: "sl3",
    customerName: "Priya Menon",
    customerPhone: "+91 98765 22110",
    items: [
      { snackId: "sk1", name: "Masala Mathri", quantity: 2, price: 120 },
      { snackId: "sk3", name: "Besan Ladoo", quantity: 1, price: 160 },
    ],
    total: 400,
    channel: "whatsapp",
    status: "delivered",
    createdAt: "2026-07-23T11:20:00+05:30",
  },
  {
    id: "sko2",
    sellerId: "sl3",
    customerName: "Arjun Rao",
    customerPhone: "+91 90344 87652",
    items: [{ snackId: "sk2", name: "Roasted Chivda", quantity: 3, price: 90 }],
    total: 270,
    channel: "whatsapp",
    status: "out-for-delivery",
    createdAt: "2026-07-24T16:40:00+05:30",
  },
  {
    id: "sko3",
    sellerId: "sl3",
    customerName: "Divya Shenoy",
    customerPhone: "+91 96540 19283",
    items: [
      { snackId: "sk5", name: "Nankhatai Cookies", quantity: 1, price: 140 },
      { snackId: "sk6", name: "Spicy Peanut Masala", quantity: 2, price: 80 },
    ],
    total: 300,
    channel: "whatsapp",
    status: "accepted",
    createdAt: "2026-07-25T09:10:00+05:30",
  },
  {
    id: "sko4",
    sellerId: "sl3",
    customerName: "Karthik Iyer",
    customerPhone: "+91 99001 55678",
    items: [{ snackId: "sk4", name: "Chakli Spirals", quantity: 4, price: 110 }],
    total: 440,
    channel: "whatsapp",
    status: "received",
    createdAt: "2026-07-25T18:05:00+05:30",
  },
];

export function getSellerByUserId(userId: string): Seller | undefined {
  return sellers.find((s) => s.userId === userId);
}

export function getSellerById(id: string): Seller | undefined {
  return sellers.find((s) => s.id === id);
}

export function getSellerByVendorId(vendorId: string): Seller | undefined {
  return sellers.find((s) => s.vendorId === vendorId);
}
