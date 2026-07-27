import type { Order } from "@/lib/types";
import { currentUser } from "./user";

/**
 * Checkout-adjacent mock data (M3): delivery-date options for the
 * per-address date picker, and an order-number sequence for the mock
 * `createOrder` mutation. Real availability (courier slots) and order
 * persistence land with the M8 backend — this just gives the checkout
 * screen real-shaped data to pick from and confirm against.
 */

export interface DeliveryDateOption {
  id: string;
  day: string; // "Sun"
  date: string; // "26 Jul"
  isoDate: string; // "2026-07-26"
}

/**
 * Next 4 days from "today" (24 Jul 2026, a Friday) with real 2026
 * weekday labels — same convention as `lib/data/laundry.ts`'s pickup
 * days, one module over since this is a Marketplace-only picker.
 */
export const deliveryDateOptions: DeliveryDateOption[] = [
  { id: "dd1", day: "Sun", date: "26 Jul", isoDate: "2026-07-26" },
  { id: "dd2", day: "Mon", date: "27 Jul", isoDate: "2026-07-27" },
  { id: "dd3", day: "Tue", date: "28 Jul", isoDate: "2026-07-28" },
  { id: "dd4", day: "Wed", date: "29 Jul", isoDate: "2026-07-29" },
];

/**
 * In-memory order-number sequence, continuing on from the wallet ledger's
 * existing "HK2043" sample transaction so the two mock fixtures don't
 * collide. `createOrder` (lib/api/orders.ts) is called from Checkout's
 * client component, so this module runs entirely in the browser tab —
 * the counter persists across client-side navigation within a session
 * but resets on a hard page reload/new tab, same as the cart itself
 * would without `lib/cart/CartContext`'s localStorage persistence. Fine
 * for a pre-backend mock; M8's real order table takes over the sequence
 * server-side.
 */
let orderSequence = 2044;

export function nextOrderNumber(): string {
  const n = orderSequence;
  orderSequence += 1;
  return `HK${n}`;
}

// ---------------------------------------------------------------------------
// Order history seed (M7a) — `/account/orders`'s unified list needs real
// past orders to show, not just whatever gets placed live this session
// (`lib/api/orders.ts`'s in-memory `orders` array starts empty every
// reload). All order numbers here stay below 2044 (`orderSequence`'s
// starting value) so a freshly-placed live order can never collide with a
// seeded one. Three of these reuse the exact order numbers already
// referenced by `lib/data/wallet.ts`'s ledger ("HK2043"/"HK2031"/"HK1987")
// so the two mock fixtures read as the same underlying history rather than
// two disconnected data sets — HK1987's ₹1,499 wallet payment and ₹75
// cashback line up with that ledger's "Paid — Festive Hamper"/"Cashback —
// Order #HK1987" rows on the same date. Statuses are deliberately spread
// across the full `OrderStatus` range (confirmed/packed/shipped/delivered/
// cancelled) so `/account/orders` and its detail `StatusTimeline` have
// something to show at every stage, not just "delivered".
// ---------------------------------------------------------------------------

export const seedOrders: Order[] = [
  {
    id: "ord-seed-1987",
    orderNumber: "HK1987",
    userId: currentUser.id,
    status: "delivered",
    items: [
      {
        id: "oi-seed-1987-1",
        productId: "pr8",
        sku: "festive-assorted-hamper-curated",
        name: "Festive Assorted Hamper",
        quantity: 1,
        price: 1499,
        addressId: "addr-demo-1",
        giftWrap: false,
      },
    ],
    shippingAddressIds: ["addr-demo-1"],
    shipments: [{ addressId: "addr-demo-1", deliveryDate: "2026-07-05" }],
    placedAt: "2026-07-02T14:10:00+05:30",
    subtotal: 1499,
    shippingFee: 0,
    total: 1499,
    walletApplied: 1499,
    cashbackEarned: 75,
    refundStatus: "none",
    paymentMethod: "wallet",
  },
  {
    id: "ord-seed-2015",
    orderNumber: "HK2015",
    userId: currentUser.id,
    status: "delivered",
    items: [
      {
        id: "oi-seed-2015-1",
        productId: "pr5",
        sku: "dark-chocolate-bark-150g",
        name: "Dark Chocolate Bark",
        quantity: 2,
        price: 340,
        addressId: "addr-demo-1",
        giftWrap: false,
      },
      {
        id: "oi-seed-2015-2",
        productId: "pr4",
        sku: "roasted-makhana-100g",
        name: "Roasted Makhana",
        quantity: 1,
        price: 160,
        addressId: "addr-demo-1",
        giftWrap: false,
      },
    ],
    shippingAddressIds: ["addr-demo-1"],
    shipments: [{ addressId: "addr-demo-1", deliveryDate: "2026-07-13" }],
    placedAt: "2026-07-10T10:32:00+05:30",
    subtotal: 840,
    shippingFee: 49,
    total: 889,
    walletApplied: 0,
    cashbackEarned: 42,
    refundStatus: "none",
    paymentMethod: "razorpay",
  },
  {
    id: "ord-seed-2020",
    orderNumber: "HK2020",
    userId: currentUser.id,
    status: "shipped",
    items: [
      {
        id: "oi-seed-2020-1",
        productId: "pr6",
        sku: "dry-fruit-laddoo-box-400g",
        name: "Dry Fruit Laddoo Box",
        quantity: 1,
        price: 560,
        addressId: "addr-demo-2",
        giftWrap: true,
      },
    ],
    shippingAddressIds: ["addr-demo-2"],
    shipments: [{ addressId: "addr-demo-2", deliveryDate: "2026-07-27" }],
    placedAt: "2026-07-15T16:45:00+05:30",
    subtotal: 560,
    shippingFee: 49,
    total: 609,
    walletApplied: 609,
    cashbackEarned: 28,
    refundStatus: "none",
    paymentMethod: "wallet",
  },
  {
    id: "ord-seed-2031",
    orderNumber: "HK2031",
    userId: currentUser.id,
    status: "cancelled",
    items: [
      {
        id: "oi-seed-2031-1",
        productId: "pr4",
        sku: "roasted-makhana-100g",
        name: "Roasted Makhana",
        quantity: 1,
        price: 160,
        addressId: "addr-demo-1",
        giftWrap: false,
      },
    ],
    shippingAddressIds: ["addr-demo-1"],
    shipments: [{ addressId: "addr-demo-1" }],
    placedAt: "2026-07-17T09:15:00+05:30",
    subtotal: 160,
    shippingFee: 49,
    total: 209,
    walletApplied: 0,
    cashbackEarned: 0,
    refundStatus: "refunded",
    paymentMethod: "razorpay",
  },
  {
    id: "ord-seed-2038",
    orderNumber: "HK2038",
    userId: currentUser.id,
    status: "packed",
    items: [
      {
        id: "oi-seed-2038-1",
        productId: "pr7",
        sku: "masala-chai-blend-150g",
        name: "Masala Chai Blend",
        quantity: 2,
        price: 275,
        addressId: "addr-demo-3",
        giftWrap: false,
      },
    ],
    shippingAddressIds: ["addr-demo-3"],
    shipments: [{ addressId: "addr-demo-3", deliveryDate: "2026-07-21" }],
    placedAt: "2026-07-18T08:00:00+05:30",
    subtotal: 550,
    shippingFee: 49,
    total: 599,
    walletApplied: 599,
    cashbackEarned: 28,
    refundStatus: "none",
    paymentMethod: "wallet",
  },
  {
    // --- M10a seller-demo orders (HK2039–HK2041) ---------------------
    // The maker seed seller (`sl1`, Anjali's Kitchen / `vd1`) needs real
    // orders to fulfil on `/seller/orders`, but none of the M7a seed
    // orders above reference `pr1` (Mango Thokku Pickle, the one product
    // `vd1` sells) — every one of them buys from a *different* vendor.
    // These three are additive only (order numbers below the 2044
    // `orderSequence` start, so a freshly-placed live order can never
    // collide) and spread across the fulfilment pipeline
    // (placed → packed → shipped) so the seller Orders screen has
    // something at every "advance status" stage on first load. Still
    // `userId: currentUser.id` — in the real world many different
    // shoppers buy from Anjali, but the mock catalog only has the one
    // seeded consumer, and seller-side scoping filters by the *product's*
    // `vendorId`, not the buyer.
    id: "ord-seed-2039",
    orderNumber: "HK2039",
    userId: currentUser.id,
    status: "placed",
    items: [
      {
        id: "oi-seed-2039-1",
        productId: "pr1",
        sku: "mango-thokku-pickle-500g",
        name: "Mango Thokku Pickle",
        quantity: 2,
        price: 469,
        addressId: "addr-demo-1",
        giftWrap: false,
      },
    ],
    shippingAddressIds: ["addr-demo-1"],
    shipments: [{ addressId: "addr-demo-1", deliveryDate: "2026-07-29" }],
    placedAt: "2026-07-25T11:20:00+05:30",
    subtotal: 938,
    shippingFee: 49,
    total: 987,
    walletApplied: 0,
    cashbackEarned: 47,
    refundStatus: "none",
    paymentMethod: "razorpay",
  },
  {
    id: "ord-seed-2040",
    orderNumber: "HK2040",
    userId: currentUser.id,
    status: "packed",
    items: [
      {
        id: "oi-seed-2040-1",
        productId: "pr1",
        sku: "mango-thokku-pickle-250g",
        name: "Mango Thokku Pickle",
        quantity: 1,
        price: 249,
        addressId: "addr-demo-2",
        giftWrap: true,
      },
      {
        id: "oi-seed-2040-2",
        productId: "pr3",
        sku: "ragi-almond-cookies-200g",
        name: "Ragi Almond Cookies",
        quantity: 1,
        price: 220,
        addressId: "addr-demo-2",
        giftWrap: true,
      },
    ],
    shippingAddressIds: ["addr-demo-2"],
    shipments: [{ addressId: "addr-demo-2", deliveryDate: "2026-07-27" }],
    placedAt: "2026-07-22T09:05:00+05:30",
    subtotal: 469,
    shippingFee: 49,
    total: 518,
    walletApplied: 0,
    cashbackEarned: 23,
    refundStatus: "none",
    paymentMethod: "razorpay",
  },
  {
    id: "ord-seed-2041",
    orderNumber: "HK2041",
    userId: currentUser.id,
    status: "shipped",
    items: [
      {
        id: "oi-seed-2041-1",
        productId: "pr1",
        sku: "mango-thokku-pickle-1kg",
        name: "Mango Thokku Pickle",
        quantity: 1,
        price: 899,
        addressId: "addr-demo-1",
        giftWrap: false,
      },
    ],
    shippingAddressIds: ["addr-demo-1"],
    shipments: [{ addressId: "addr-demo-1", deliveryDate: "2026-07-26" }],
    placedAt: "2026-07-20T15:40:00+05:30",
    subtotal: 899,
    shippingFee: 0,
    total: 899,
    walletApplied: 899,
    cashbackEarned: 45,
    refundStatus: "none",
    paymentMethod: "wallet",
  },
  {
    id: "ord-seed-2043",
    orderNumber: "HK2043",
    userId: currentUser.id,
    status: "confirmed",
    items: [
      {
        id: "oi-seed-2043-1",
        productId: "pr3",
        sku: "ragi-almond-cookies-200g",
        name: "Ragi Almond Cookies",
        quantity: 3,
        price: 220,
        addressId: "addr-demo-1",
        giftWrap: false,
      },
      {
        id: "oi-seed-2043-2",
        productId: "pr2",
        sku: "green-chilli-chutney-200g",
        name: "Green Chilli Chutney",
        quantity: 1,
        price: 189,
        addressId: "addr-demo-1",
        giftWrap: false,
      },
    ],
    shippingAddressIds: ["addr-demo-1"],
    shipments: [{ addressId: "addr-demo-1", deliveryDate: "2026-07-22" }],
    placedAt: "2026-07-18T18:30:00+05:30",
    subtotal: 849,
    shippingFee: 49,
    total: 898,
    walletApplied: 0,
    cashbackEarned: 42,
    refundStatus: "none",
    paymentMethod: "razorpay",
  },
];
