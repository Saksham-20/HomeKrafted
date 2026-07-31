/**
 * Gifting Marketplace types — multi-vendor catalog, hamper builder,
 * cart/wishlist, and the order + gifting model.
 */

import type { ID, ISODateString } from "./shared";

// ---------------------------------------------------------------------------
// Vendors
// ---------------------------------------------------------------------------

/** "homekrafted" = platform-curated items (e.g. the Festive Assorted Hamper). */
export type VendorType = "maker" | "baker" | "artist" | "homekrafted";

export interface Vendor {
  id: ID;
  slug: string;
  name: string;
  type: VendorType;
  bio: string;
  avatarPlaceholder: string;
  bannerPlaceholder: string;
  avatarSrc?: string;
  bannerSrc?: string;
  /** Human-readable address line, e.g. "Sector 35, Chandigarh". */
  location: string;
  /** Tricity area id from `lib/geo.ts#TRICITY_AREAS`. */
  area: string;
  lat: number;
  lng: number;
  /** How far this kitchen delivers. Buyers outside it don't see its items. */
  deliveryRadiusKm: number;
  rating: number;
  reviewCount: number;
  followerCount: number;
  isFollowing?: boolean;
  joinedAt: ISODateString;
}

// ---------------------------------------------------------------------------
// HomeKrafter profile (M16)
//
// Kept separate from `Vendor` for the same reason `VendorProfile` is its
// own table: `Vendor` rides on every product card and every distance
// filter, and none of those need a shop's return policy. The storefront
// and the seller editor fetch this; nothing else does.
// ---------------------------------------------------------------------------

export type VendorPhotoKind = "kitchen" | "process" | "team" | "award";

export interface VendorPhoto {
  id: ID;
  url: string;
  caption?: string;
  kind: VendorPhotoKind;
  sortOrder: number;
}

/**
 * One thing a buyer can check about a kitchen. `earned: false` entries are
 * returned too — the seller's own view is a checklist, and the storefront
 * needs to be able to say "not verified yet" rather than silently omitting.
 */
export interface TrustSignal {
  key: string;
  label: string;
  earned: boolean;
  detail: string;
  weight: number;
}

export type TrustTier = "new" | "building" | "established" | "trusted";

export interface TrustSummary {
  score: number;
  tier: TrustTier;
  signals: TrustSignal[];
}

/** Derived badge. Every one is a fact visible elsewhere on the page — nothing here is awarded. */
export interface VendorAchievement {
  key: string;
  label: string;
  detail: string;
}

export interface VendorStats {
  ordersDelivered: number;
  /** `null` when nothing has closed yet — an unknown rate, not a perfect one. */
  cancellationRate: number | null;
  monthsActive: number;
  rating: number;
  reviewCount: number;
  followerCount: number;
}

export interface VendorProfileCompletion {
  percent: number;
  missing: { key: string; label: string }[];
}

/**
 * The public shape. Note what is **not** here: `fssaiNumber`. The licence
 * identifier belongs to the HomeKrafter; a buyer needs the verified fact,
 * not the number, and publishing it buys them nothing.
 */
export interface VendorProfile {
  tagline?: string;
  story?: string;
  knownFor: string[];
  languages: string[];
  prepTimeMins?: number;
  responseTimeMins?: number;
  capacityPerDay?: number;
  minOrderValue?: number;
  /** 0 = Sunday, matching `Date.getDay()`. Empty means "not stated", never "closed". */
  workingDays: number[];
  opensAt?: string;
  closesAt?: string;
  cancellationPolicy?: string;
  returnPolicy?: string;
  customOrderPolicy?: string;
  acceptsCustomOrders: boolean;
  packagingNote?: string;
  hygieneNote?: string;
  fssaiVerified: boolean;
  identityVerified: boolean;
  addressVerified: boolean;
  instagramUrl?: string;
  facebookUrl?: string;
  youtubeUrl?: string;
  websiteUrl?: string;
  photos: VendorPhoto[];
  trust: TrustSummary;
  achievements: VendorAchievement[];
  stats: VendorStats;
}

/** The seller's own view — adds what only they (and an admin) should see. */
export interface OwnVendorProfile extends VendorProfile {
  fssaiNumber?: string;
  fssaiExpiry?: ISODateString;
  verifiedAt?: ISODateString;
  verificationNote?: string;
  completion: VendorProfileCompletion;
}

/** What the admin verification panel reads — the seller's own view plus who it belongs to. */
export interface AdminSellerProfile extends OwnVendorProfile {
  sellerId: ID;
  vendorId: ID;
  vendorSlug: string;
  displayName: string;
}

/** Admin-only write. Absent fields are left as they are, so identity can be verified today and the licence next week. */
export interface VerificationInput {
  identityVerified?: boolean;
  addressVerified?: boolean;
  fssaiVerified?: boolean;
  fssaiExpiry?: ISODateString;
  note?: string;
}

// ---------------------------------------------------------------------------
// Catalog: category, occasion, collection
// ---------------------------------------------------------------------------

export interface Category {
  id: ID;
  slug: string;
  name: string;
  imagePlaceholder: string;
  imageSrc?: string;
  productCount: number;
}

export interface Occasion {
  id: ID;
  slug: string;
  name: string;
  /** Single-letter glyph shown in the gold ring tile (no image, per design system). */
  initial: string;
}

export interface Collection {
  id: ID;
  slug: string;
  title: string;
  description?: string;
  occasionId?: ID;
  productIds: ID[];
}

// ---------------------------------------------------------------------------
// Product
// ---------------------------------------------------------------------------

export interface WeightOption {
  sku: string;
  label: string; // "250 g", "1 kg", "curated"
  price: number;
  mrp: number;
  stock: number;
}

export interface ProductImage {
  /** Fallback label rendered by <ImageSlot> when no source image exists. */
  placeholder: string;
  src?: string;
  ratio: string; // '1/1' | '4/5' | ...
}

export type DietaryTag =
  | "vegetarian"
  | "vegan"
  | "gluten-free"
  | "sugar-free"
  | "contains-nuts";

export type ProductTag = "Bestseller" | "New" | "Festive" | "Curated";

/**
 * Admin moderation state (M11b, `/admin/catalog`) — a real lifecycle
 * column the M8 schema needs, not a UI convenience field: `"active"`
 * (default — browsable), `"hidden"` (taken down, excluded from every
 * consumer-facing browse/listing query in `lib/api/products.ts`, same as
 * a real soft-delete), `"flagged"` (still browsable, but surfaced in the
 * admin queue for review). Optional so every pre-M11b seed product reads
 * as `"active"` via `?? "active"` without a data migration.
 */
export type ProductModerationStatus = "active" | "hidden" | "flagged";

export interface Product {
  id: ID;
  slug: string;
  vendorId: ID;
  name: string;
  categoryId: ID;
  occasionIds: ID[];
  dietary: DietaryTag[];
  images: ProductImage[];
  weightOptions: WeightOption[];
  defaultWeightSku: string;
  rating: number;
  reviewCount: number;
  tags: ProductTag[];
  /** Ready-to-ship packaged food vs. made-to-order. */
  isPackaged: boolean;
  /** Wallet cashback percentage earned on this product. */
  cashbackPct: number;
  description: string;
  ingredients?: string;
  shelfLife?: string;
  storageInstructions?: string;
  madeIn?: string;
  /** See `ProductModerationStatus`'s doc comment. Absent reads as `"active"`. */
  moderationStatus?: ProductModerationStatus;
  /**
   * The HomeKrafter's own "am I making this right now" switch, toggled from
   * the portal's Availability panel. Distinct from `moderationStatus`,
   * which is the admin's call — an item can be perfectly allowed and simply
   * not being cooked today. Buyers never see `false`.
   */
  isAvailable?: boolean;
  /**
   * Distance from the buyer to this kitchen, in km. Only present when the
   * request carried the buyer's coordinates; absent means "we don't know
   * where you are", not "far away".
   */
  distanceKm?: number;
  /** Pre-formatted `distanceKm`, e.g. "4.6 km". */
  distanceLabel?: string;
  /** Admin-curated home "This week's small batches" flag (M11b) — `getFeatured()` (`lib/api/products.ts`) filters on this directly instead of a hardcoded id list. `/admin/catalog`'s feature toggle mutates it client-side; since Home is a Server Component, the effect lands on that page's next server-side fetch (a real backend request in M8), not this same browser tab — see `lib/api/admin.ts`'s "Catalog & review moderation" section header. */
  featured?: boolean;
}

// ---------------------------------------------------------------------------
// Cart & wishlist
// ---------------------------------------------------------------------------

/**
 * A cart line is polymorphic (M3): either a catalog product line
 * (`productId`+`sku` set) or an assembled gift-hamper line (`hamperId`
 * set, referencing a `Hamper` record) — never both. Mirrors how a real
 * schema would model "either a product or a bundle" on one order line
 * (nullable FKs, app-level XOR) rather than two separate tables.
 */
export interface CartItem {
  id: ID;
  /** Set for a regular product line. */
  productId?: ID;
  sku?: string;
  /** Set for an assembled-hamper line — mutually exclusive with productId/sku. */
  hamperId?: ID;
  quantity: number;
  giftWrap?: boolean;
  /** Which saved address this line ships to — multi-address checkout. */
  addressId?: ID;
}

export interface Cart {
  id: ID;
  userId: ID;
  items: CartItem[];
  updatedAt: ISODateString;
}

/**
 * M8.4a — the real `GET /cart` response line shape (`docs/API.md` "Cart
 * (owner-scoped)"): richer than the base `CartItem` above, since the
 * server resolves every display/pricing field
 * (`CartContext.lineInfo()`'s pre-M8.4a job) itself from
 * `resolveCartLine`, rather than the client computing them from a
 * separately-fetched catalog. `CartContext` reads these fields directly
 * and no longer needs its own `lineInfo()` catalog lookup in real mode.
 */
export interface ServerCartLine extends CartItem {
  name: string;
  unitPrice: number;
  lineTotal: number;
  imageSrc?: string;
  weightLabel?: string;
  /** Stock cap for a product line — absent (unbounded) for a hamper line. */
  maxQuantity?: number;
  isHamper: boolean;
}

/** M8.4a — the real `GET /cart` response envelope; `count`/`subtotal`/`shippingFee`/`total`/`cashbackEstimate` are server-computed, same rules as `lib/cart/pricing.ts`. */
export interface ServerCart {
  id: ID;
  userId: ID;
  updatedAt: ISODateString;
  items: ServerCartLine[];
  count: number;
  subtotal: number;
  shippingFee: number;
  total: number;
  cashbackEstimate: number;
}

export interface WishlistItem {
  productId: ID;
  addedAt: ISODateString;
}

export interface Wishlist {
  id: ID;
  userId: ID;
  items: WishlistItem[];
}

// ---------------------------------------------------------------------------
// Hamper builder
// ---------------------------------------------------------------------------

export interface HamperBox {
  id: ID;
  name: string; // "Petite" | "Signature" | "Grand"
  maxItems: number;
  price: number;
  itemsLabel: string; // "Up to 5 items"
}

export type GiftWrapStyle = "kraft" | "floral" | "festive" | "minimal";
export type RibbonColor = "gold" | "terracotta" | "pine" | "ivory";

export interface HamperItem {
  productId: ID;
  quantity: number;
}

export interface Hamper {
  id: ID;
  userId: ID;
  boxId: ID;
  items: HamperItem[];
  giftNote?: string;
  wrap?: GiftWrapStyle;
  ribbon?: RibbonColor;
  nameCard?: string;
  /** Gift-to-recipient: ship straight to someone else. */
  recipientAddressId?: ID;
  hidePrice: boolean;
  createdAt: ISODateString;
}

// ---------------------------------------------------------------------------
// Orders
// ---------------------------------------------------------------------------

/**
 * `"pending-payment"` (M8.4a) — a real order's starting status
 * (`server/src/orders/orders.service.ts#create`, every `paymentMethod`,
 * see `docs/API.md`'s M8.2 seam notes): the wallet-debit/cashback-credit
 * (`POST /orders/:id/pay`) or Razorpay capture webhook transitions a
 * `"wallet"`/`"razorpay"` order on to `"placed"`. `"cod"` has no follow-up
 * transition endpoint yet (a flagged server-side gap, not client-fixable)
 * — `ORDER_STATUS_LABEL` below still shows a shopper-friendly label for
 * it rather than a raw "pending payment" that would read as broken.
 */
export type OrderStatus =
  | "pending-payment"
  | "placed"
  | "confirmed"
  | "packed"
  | "shipped"
  | "delivered"
  | "cancelled"
  | "returned";

export type PaymentMethod = "wallet" | "razorpay" | "cod";

export type RefundStatus = "none" | "requested" | "processing" | "refunded";

/** Same product-or-hamper polymorphism as `CartItem` — see its comment. */
export interface OrderItem {
  id: ID;
  productId?: ID;
  sku?: string;
  hamperId?: ID;
  name: string;
  quantity: number;
  price: number;
  /** Which shipping address this line went to (multi-address checkout). */
  addressId: ID;
  giftWrap: boolean;
}

/** One row per distinct shipping address on an order — its own delivery date. */
export interface OrderShipment {
  addressId: ID;
  deliveryDate?: ISODateString;
}

export interface OrderGift {
  isGift: boolean;
  recipientName?: string;
  /**
   * M8.4a: must be one of the caller's own saved `Address` ids — the real
   * `POST /orders` endpoint 404s otherwise (`docs/API.md` "Orders
   * (owner-scoped)"). The pre-M8.4a mock accepted a synthetic
   * `"gift-recipient"` placeholder string here; `CheckoutClient` now saves
   * the recipient's address to the account's address book (via
   * `createAddress`) before placing the order so this is always real.
   */
  recipientAddressId?: ID;
  /** Hide price on the packing slip / recipient-facing surfaces. */
  hidePrice: boolean;
  message?: string;
}

export interface Order {
  id: ID;
  orderNumber: string; // "HK2043"
  userId: ID;
  status: OrderStatus;
  items: OrderItem[];
  /** Distinct address ids across all items — multi-address checkout. */
  shippingAddressIds: ID[];
  /** Per-address delivery date — one row per entry in `shippingAddressIds`. */
  shipments: OrderShipment[];
  gift?: OrderGift;
  placedAt: ISODateString;
  subtotal: number;
  shippingFee: number;
  total: number;
  walletApplied: number;
  cashbackEarned: number;
  refundStatus: RefundStatus;
  /**
   * What the buyer said when they cancelled or asked to return, in their
   * own words, and when (M15). Optional because most orders never have
   * one — and because every row written before M15 predates the columns.
   */
  refundReason?: string;
  refundRequestedAt?: ISODateString;
  cancelledAt?: ISODateString;
  /** When the HomeKrafter marked it delivered — what the 7-day return window counts from. */
  deliveredAt?: ISODateString;
  paymentMethod: PaymentMethod;
}
