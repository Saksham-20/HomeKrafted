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
  location: string;
  rating: number;
  reviewCount: number;
  followerCount: number;
  isFollowing?: boolean;
  joinedAt: ISODateString;
}

// ---------------------------------------------------------------------------
// Catalog: category, occasion, collection
// ---------------------------------------------------------------------------

export interface Category {
  id: ID;
  slug: string;
  name: string;
  imagePlaceholder: string;
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
  /** Label rendered by <ImageSlot> until real photography lands. */
  placeholder: string;
  ratio: string; // '1/1' | '4/5' | ...
}

export type DietaryTag =
  | "vegetarian"
  | "vegan"
  | "gluten-free"
  | "sugar-free"
  | "contains-nuts";

export type ProductTag = "Bestseller" | "New" | "Festive" | "Curated";

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

export type OrderStatus =
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
  paymentMethod: PaymentMethod;
}
