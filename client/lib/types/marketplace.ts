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
  /**
   * The coarsest location key we hold — a curated `lib/geo.ts` area id
   * where one applies, otherwise the pincode (M36, when supply went
   * national). Read for search and display; nothing filters on it.
   */
  area: string;
  /** Where they said they are (M36). Absent for kitchens approved before it was asked. */
  pincode?: string;
  /**
   * Kitchen coordinates — what every distance filter measures against,
   * and therefore what decides which buyers see this storefront at all.
   * Confirmed by an admin, never taken raw from a pincode centroid.
   */
  lat: number;
  lng: number;
  /** How far this kitchen delivers. Buyers outside it don't see its items. */
  deliveryRadiusKm: number;
  rating: number;
  reviewCount: number;
  followerCount: number;
  isFollowing?: boolean;
  joinedAt: ISODateString;
  /**
   * M46 — the HomeKrafter's own discount on their own listings, when one
   * is running. Absent means none, rather than `{ pct: 0 }`, so a banner
   * branches on presence without knowing the expiry rule.
   *
   * It is the kitchen's money: the percentage comes off what a buyer
   * pays, and commission is computed on what was actually charged.
   */
  discount?: { pct: number; endsAt?: ISODateString };
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

/**
 * When a kitchen can take an order (M16, M2). Three separate things,
 * deliberately not merged: the weekly pattern (`workingDays`), the
 * exceptions to it (`blackouts`), and how much notice is needed
 * (`prepTimeMins`).
 */
export interface VendorAvailability {
  vendorId: ID;
  /** Minutes of notice. Defaults to the platform's 90 when the kitchen hasn't said — never to zero. */
  prepTimeMins: number;
  /** 0 = Sunday. Empty means "not stated", which the picker reads as every day — never as closed. */
  workingDays: number[];
  blackouts: { date: ISODateString; reason?: string }[];
  capacityPerDay?: number;
}

export interface VendorBlackout {
  id: ID;
  date: ISODateString;
  reason?: string;
}

/**
 * Where a rider collects (M36b) — the HomeKrafter's own address.
 *
 * **Present only on `OwnVendorProfile` and `AdminSellerProfile`**, never
 * on `VendorProfile` (the public storefront shape). That split is the
 * whole design: a buyer sees `Vendor.location`, a coarse area label, and
 * the `/sell` form promises in as many words that they see nothing more.
 * `server/test/unit/vendor-privacy.spec.ts` fails the build if the public
 * catalog surface starts reading these.
 */
export interface PickupAddress {
  addressLine1?: string;
  addressLine2?: string;
  landmark?: string;
  pincode?: string;
  phone?: string;
}

/** The seller's own view — adds what only they (and an admin) should see. */
export interface OwnVendorProfile extends VendorProfile {
  fssaiNumber?: string;
  fssaiExpiry?: ISODateString;
  verifiedAt?: ISODateString;
  verificationNote?: string;
  completion: VendorProfileCompletion;
  /** Never rendered on a buyer-facing surface — see `PickupAddress`. */
  pickup?: PickupAddress;
  /**
   * Where the platform currently believes the kitchen is — the exact
   * coordinates behind delivery-distance filtering, correctable via
   * `PATCH /seller/profile/coords`. Own-view only, same rule as
   * `pickup`: the public payload carries a ~1.1 km rounded point (M36).
   */
  pin?: {
    lat: number;
    lng: number;
    pincode?: string;
    /** When a person last vouched for the pin — the kitchen's own GPS fix or an admin correction. Absent = still the approval seed. */
    confirmedAt?: ISODateString;
  };
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

/**
 * What sort of thing a listing is (M20).
 *
 * `Product` was food-shaped throughout — `dietary`, `ingredients`,
 * `shelfLife` — because until now everything sold here was food.
 * "Handcrafted Gifts" is not. One field rather than a second type, for the
 * same reason M18 made a hamper a `Product`: a craft still needs a vendor,
 * photos, price tiers, reviews, cart and search, and a parallel type
 * re-derives all of it and then drifts.
 */
export type ProductKind = "food" | "craft";

/**
 * How far a listing travels (M20). `local` is gated on the kitchen's
 * delivery radius; `national` goes in the post and skips that gate
 * entirely — a candle's reach has nothing to do with how far somebody will
 * drive a hot meal.
 */
export type ProductShippingScope = "local" | "national";

export interface Category {
  id: ID;
  slug: string;
  name: string;
  imagePlaceholder: string;
  imageSrc?: string;
  productCount: number;
  /** Which side of the catalogue this belongs to. Absent reads as `"food"`. */
  group?: ProductKind;
  sortOrder?: number;
}

/**
 * A shelf or an occasion somebody has asked to have added (M50).
 *
 * **Why this is an ask rather than a row.** A HomeKrafter had nowhere in
 * the product to say "there is no shelf for what I make" — the picker's
 * empty state read "Ask us to add it" and there was nobody to ask.
 * Letting them add one is what the server refuses: `Category` and
 * `Occasion` are a shared vocabulary the whole catalogue browses by, and
 * one anybody can append to stops being one ("Pickles", "Pickle" and
 * "Achaar" as three half-empty shelves). An admin reads the queue and
 * mints the real row — which is also the only point where somebody
 * looking at the whole list sees the name.
 */
export type TaxonomyKind = "category" | "occasion";

export type TaxonomySuggestionStatus = "pending" | "approved" | "rejected";

export interface TaxonomySuggestion {
  id: ID;
  kind: TaxonomyKind;
  name: string;
  /** Categories only — which half of the catalogue it belongs on. */
  group?: ProductKind;
  /** What they make, in their words. The one field that tells a real gap from a synonym. */
  note?: string;
  status: TaxonomySuggestionStatus;
  suggestedById: ID;
  suggestedByName?: string;
  vendorId?: ID;
  vendorName?: string;
  /** The refusal, word for word. It is the only thing saying what to do next. */
  decisionNote?: string;
  reviewedAt?: ISODateString;
  /** What approval created, so the queue can link to the live row. */
  resultCategoryId?: ID;
  resultOccasionId?: ID;
  createdAt: ISODateString;
}

export interface Occasion {
  id: ID;
  slug: string;
  name: string;
  /** Single-letter glyph shown in the gold ring tile (no image, per design system). */
  initial: string;
  /**
   * M16 (H8). The next date this occasion falls on, set by an admin —
   * **not** a recurrence rule. Indian festivals are lunisolar and move
   * against the Gregorian calendar every year, so a `MM-DD` field would
   * be wrong for exactly the occasions that matter most.
   *
   * `undefined` means evergreen: a birthday has no season, and
   * `/collections` lists those separately rather than sorting them into a
   * countdown they don't have.
   */
  celebratedOn?: ISODateString;
  tagline?: string;
  imageSrc?: string;
}

/**
 * A curated gift guide. Since M16 it has its own page (`/guides/[slug]`)
 * rather than existing only as the hand-picked ordering behind an
 * occasion — so a guide can stand alone (`occasionId` undefined), and an
 * occasion can eventually carry more than one.
 */
export interface Collection {
  id: ID;
  slug: string;
  title: string;
  description?: string;
  occasionId?: ID;
  productIds: ID[];
  imageSrc?: string;
  /** What `/collections` and the home rail promote. */
  featured?: boolean;
  /** The merchandiser's running order; ties break on title. */
  sortOrder?: number;
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
  /**
   * M46 — `price` after the HomeKrafter's storefront discount, present
   * only while one is running.
   *
   * **Computed server-side, never here.** The number a buyer is shown and
   * the number they are charged have to come from the same place; the
   * cart's authority is `resolveCartLine`, and this is the same
   * arithmetic done once in `mapProduct` so a card cannot disagree with
   * the checkout.
   */
  salePrice?: number;
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
 *
 * **M22 added `"pending"` and `"rejected"`** — a listing is now reviewed
 * before it is public, rather than taken down afterwards. Mirrors
 * `server/prisma/schema.prisma`'s enum; keep the two in step.
 *
 * The same trap applies here as on the server: **filter on `=== "active"`,
 * never `!== "hidden"`.** Every consumer filter in `lib/api` was the
 * latter until M22, which was equivalent only while `"hidden"` was the
 * one bad state. It is not equivalent now — a denylist shows unreviewed
 * listings, and looks like it is working while it does.
 */
export type ProductModerationStatus =
  /** Submitted, never reviewed, not public. The default for new listings. */
  | "pending"
  /** Reviewed and allowed. The only state a buyer sees. */
  | "active"
  /** Reviewed and refused, with a reason — the HomeKrafter edits and resubmits. */
  | "rejected"
  /** Was live, an admin removed it. Direct links still resolve. */
  | "hidden"
  /** Under investigation — off the storefront, not yet decided. */
  | "flagged";

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
  /**
   * A ready-made gift hamper, listed by the HomeKrafter who assembles it
   * (M18). `/hamper` is exactly the catalogue filtered on this.
   *
   * Optional so every mock and fixture predating M18 still type-checks;
   * absent reads as `false`.
   */
  isHamper?: boolean;
  /**
   * Food or craft (M20). Optional so every fixture predating M20 still
   * type-checks; absent reads as `"food"`, which is what they all were.
   * Branch on this before rendering a shelf life or a dietary tag.
   */
  kind?: ProductKind;
  /**
   * Local delivery or posted nationally (M20). Absent reads as `"local"`.
   * Decides whether "delivers to your area" is a true thing to say.
   */
  shippingScope?: ProductShippingScope;
  /**
   * On the WhatsApp snacks menu (M20). Absent reads as `false`.
   *
   * A capability flag like `isHamper`, not a category: the listing stays in
   * the main shop either way, and `/snacks` is the catalogue filtered on
   * this merged with the seeded `Snack` rows.
   */
  isSnack?: boolean;
  /** Wallet cashback percentage earned on this product. */
  cashbackPct: number;
  description: string;
  ingredients?: string;
  shelfLife?: string;
  storageInstructions?: string;
  madeIn?: string;
  /** See `ProductModerationStatus`'s doc comment. Absent reads as `"active"`. */
  /**
   * M46 — the maker's storefront discount, mirrored onto the product so a
   * card can say "10% off" without loading the vendor. Present only while
   * one is running; each `weightOptions[].salePrice` is the price it
   * produced.
   */
  discountPct?: number;
  moderationStatus?: ProductModerationStatus;
  /**
   * The admin's reason for refusing, hiding or flagging — shown verbatim
   * to the HomeKrafter in the portal, and **never to a buyer**. A refusal
   * without one gives the person who has to fix it nothing to act on.
   */
  moderationNote?: string;
  /** When the decision in `moderationStatus` was made. */
  moderatedAt?: ISODateString;
  /** When this listing last entered review. The admin queue orders on it. */
  submittedAt?: ISODateString;
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
  /**
   * M46 — the price before the maker's storefront sale, present only when
   * one applied. The row strikes this through; `unitPrice` is what is
   * charged, and both come from `resolveCartLine` so the cart and the
   * order created from it cannot disagree.
   */
  listUnitPrice?: number;
  /** The storefront sale that produced `unitPrice`, when one applied. */
  discountPct?: number;
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

/**
 * An order as the *seller* portal sees it (M37) — the projection
 * `GET /seller/orders*` returns instead of the buyer's `Order`.
 *
 * A participant in a multi-vendor order gets their own line items and
 * destinations, the gift text they may have to write, and the payment
 * method. They never get the other kitchens' items, the buyer's `userId`,
 * or the whole-order money — `itemsSubtotal` is their own lines only,
 * which is also the figure payouts are computed from.
 */
export interface SellerOrder {
  id: ID;
  orderNumber: string;
  status: OrderStatus;
  /** This seller's own line items only. */
  items: OrderItem[];
  /** Σ price×quantity over `items` — this seller's share, not the order total. */
  itemsSubtotal: number;
  /** Distinct address ids across this seller's own items. */
  shippingAddressIds: ID[];
  shipments: OrderShipment[];
  gift?: OrderGift;
  placedAt: ISODateString;
  cancelledAt?: ISODateString;
  deliveredAt?: ISODateString;
  paymentMethod: PaymentMethod;
  /**
   * Another kitchen's items share this order. When true, `shipped` and
   * `delivered` are recorded by the Homekrafted team (admin override),
   * not from the portal — the UI explains instead of offering a button
   * that 403s.
   */
  multiVendor: boolean;
}
