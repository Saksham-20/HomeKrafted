/**
 * Shared platform types — the account layer every module (Marketplace,
 * Laundry, Snacks) sits on top of. This is the schema contract: these
 * types become the Prisma models in M8, so field names and unions here
 * should be treated as the source of truth, not the mock data shape.
 */

/** All entity ids are opaque strings (cuid/uuid once Prisma lands). */
export type ID = string;

/** ISO 8601 date or date-time string, e.g. "2026-07-19" or a full timestamp. */
export type ISODateString = string;

// ---------------------------------------------------------------------------
// User & address
// ---------------------------------------------------------------------------

export type AuthProvider = "phone" | "email" | "google" | "apple";

/**
 * Role surface (M10a) — which route group + login a user belongs to.
 * `consumer` is the default for every shopper-facing account created via
 * `/login`; `seller` gates `/seller/*` (see `lib/auth/AuthContext.tsx` +
 * `middleware.ts`); `admin` is reserved for M11 (`/admin/*`) and has no
 * seed data yet. A given `User` row is one role today — the plan's
 * "seller = homemaker with their own account" model, not a permission
 * a consumer account can toggle on itself (that's what `/sell` →
 * `SellerApplication` → admin approval is for).
 */
export type UserRole = "consumer" | "seller" | "admin";

export interface User {
  id: ID;
  name: string;
  email?: string;
  phone?: string;
  avatarPlaceholder?: string;
  authProviders: AuthProvider[];
  createdAt: ISODateString;
  walletId: ID;
  loyaltyAccountId: ID;
  referralCode: string;
  referredByCode?: string;
  /** Defaults to "consumer" for every M0–M7 seed user; see `UserRole`. */
  role: UserRole;
  /**
   * M11a — set by `/admin/users`' suspend/reactivate action
   * (`lib/api/admin.ts#setUserSuspended`). Undefined/false for every
   * pre-M11a seed user (active by default); a suspended user isn't
   * actually blocked from signing in yet (no real session/auth to gate
   * — M8 wires that up), this only drives the admin-facing badge + list
   * filter today.
   */
  suspended?: boolean;
}

export interface Address {
  id: ID;
  userId: ID;
  label: string; // "Home", "Office", ...
  recipientName: string;
  phone: string;
  line1: string;
  line2?: string;
  city: string;
  state: string;
  pincode: string;
  country: string;
  isDefault: boolean;
  instructions?: string;
}

// ---------------------------------------------------------------------------
// Reviews
// ---------------------------------------------------------------------------

export type ReviewTargetType = "product" | "vendor" | "service";

export interface Review {
  id: ID;
  targetType: ReviewTargetType;
  targetId: ID;
  userId: ID;
  userName: string;
  rating: 1 | 2 | 3 | 4 | 5;
  title?: string;
  body: string;
  createdAt: ISODateString;
  helpfulCount: number;
  verifiedPurchase: boolean;
  /**
   * Seller/maker reply (M10a `/seller/reviews`) — at most one reply per
   * review, authored by the vendor's seller account. Optional so every
   * pre-M10a review (none replied to yet) needs no data migration.
   */
  sellerReply?: {
    body: string;
    createdAt: ISODateString;
  };
  /** User-reported flag (M11b) — surfaces the review in `/admin/catalog/reviews`'s moderation queue. Independent of `hidden`: a flagged review stays publicly visible until a moderator actually acts on it. */
  flagged?: boolean;
  /** Moderator action (M11b, `/admin/catalog/reviews`) — hidden reviews are excluded from `getProductReviews`/`getVendorReviews` (`lib/api/reviews.ts`), same client/server module-graph caveat as `Product.moderationStatus` (see `lib/api/admin.ts`'s "Catalog & review moderation" section header). */
  hidden?: boolean;
}

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------

export type NotificationChannel = "sms" | "whatsapp" | "email" | "inapp";
export type NotificationCategory =
  | "order"
  | "laundry"
  | "snacks"
  | "wallet"
  | "promo"
  | "account";

export interface Notification {
  id: ID;
  userId: ID;
  channel: NotificationChannel;
  category: NotificationCategory;
  title: string;
  body: string;
  read: boolean;
  createdAt: ISODateString;
  refType?: "order" | "laundryBooking" | "walletTransaction" | "support";
  refId?: ID;
}

/** One row per (user, category) — which channels the user allows for it. */
export interface NotificationPreference {
  userId: ID;
  category: NotificationCategory;
  sms: boolean;
  whatsapp: boolean;
  email: boolean;
  inapp: boolean;
}

// ---------------------------------------------------------------------------
// Referral & loyalty
// ---------------------------------------------------------------------------

export type ReferralStatus = "pending" | "joined" | "rewarded";

export interface Referral {
  id: ID;
  referrerUserId: ID;
  code: string;
  refereeName?: string;
  refereeUserId?: ID;
  status: ReferralStatus;
  rewardAmount?: number;
  createdAt: ISODateString;
}

export type LoyaltyTier = "bronze" | "silver" | "gold" | "platinum";

export interface LoyaltyAccount {
  id: ID;
  userId: ID;
  tier: LoyaltyTier;
  points: number;
  lifetimePoints: number;
  pointsToNextTier?: number;
}

// ---------------------------------------------------------------------------
// Support
// ---------------------------------------------------------------------------

export type SupportChannel = "chat" | "call" | "email";
export type SupportTicketStatus = "open" | "in-progress" | "resolved" | "closed";

export interface SupportMessage {
  id: ID;
  ticketId: ID;
  sender: "user" | "agent";
  body: string;
  createdAt: ISODateString;
}

export interface SupportTicket {
  id: ID;
  userId: ID;
  subject: string;
  channel: SupportChannel;
  status: SupportTicketStatus;
  orderRef?: string;
  createdAt: ISODateString;
  updatedAt: ISODateString;
  messages: SupportMessage[];
}

// ---------------------------------------------------------------------------
// Corporate / bulk gifting inquiry
// ---------------------------------------------------------------------------

export type CorporateInquiryStatus = "new" | "contacted" | "quoted" | "closed";

export interface CorporateInquiry {
  id: ID;
  companyName: string;
  contactName: string;
  email: string;
  phone: string;
  occasion?: string;
  estimatedQuantity: number;
  budgetRange?: string;
  message: string;
  status: CorporateInquiryStatus;
  createdAt: ISODateString;
}

// ---------------------------------------------------------------------------
// Seller onboarding (future) — M7b adds this type. Not modeled at M0
// because the plan's `/sell` line item is explicitly future-flagged
// ("seller onboarding *(future)* — info + form, wired but disabled"); the
// M7b brief calls for a real application form + mock submit, so this is a
// genuinely missing field per CLAUDE.md's "extend lib/types only if a
// field is missing" allowance — modeled the same shape as
// `CorporateInquiry` (standalone, no user FK — an application may predate
// an account).
// ---------------------------------------------------------------------------

export type SellerApplicationCategory = "maker" | "baker" | "artist" | "other";
/**
 * `new`/`reviewing`/`waitlisted` are `/sell`'s own pre-decision framing
 * (a submitted application defaults to `waitlisted` today, see
 * `lib/api/sell.ts#createSellerApplication`'s comment — onboarding
 * itself is future-flagged, so nothing actually reviews these yet).
 * `approved`/`rejected` are M11a's admin-decision terminal states —
 * `/admin/sellers`' approval queue treats every non-terminal status
 * (`new`/`reviewing`/`waitlisted`) as "pending", see
 * `lib/api/admin.ts#getPendingSellerApplications`.
 */
export type SellerApplicationStatus =
  | "new"
  | "reviewing"
  | "waitlisted"
  | "approved"
  | "rejected";

/**
 * What a HomeKrafter makes or offers.
 *
 * A **display/discovery tag, not a role.** There is one supply-side role —
 * HomeKrafter — and every one of them gets every portal module. Nothing may
 * branch on this to decide access; it exists so buyers can filter and so a
 * kitchen can say what it does. Mirrors `SellerSpecialty` in the Prisma
 * schema.
 */
export type SellerSpecialty =
  | "homemade_food"
  | "bakery"
  | "pickles_preserves"
  | "snacks"
  | "sweets"
  | "crafts"
  | "laundry"
  | "cleaning";

/** Human labels for `SellerSpecialty`, for chips and the apply form. */
export const SPECIALTY_LABELS: Record<SellerSpecialty, string> = {
  homemade_food: "Homemade food",
  bakery: "Bakery",
  pickles_preserves: "Pickles & preserves",
  snacks: "Snacks",
  sweets: "Sweets",
  crafts: "Crafts",
  laundry: "Laundry",
  cleaning: "Cleaning",
};

export interface SellerApplication {
  id: ID;
  businessName: string;
  contactName: string;
  email: string;
  phone: string;
  category: SellerApplicationCategory;
  /** What they intend to offer — becomes `Seller.specialties` on approval. */
  specialties?: SellerSpecialty[];
  city: string;
  /**
   * Tricity area id from `lib/geo.ts#TRICITY_AREAS`. Decides the
   * coordinates the new kitchen is created at, which is what every buyer's
   * distance filter measures against — so the apply form requires it.
   */
  area: string;
  /** How far they'll deliver, km. Editable later from storefront settings. */
  deliveryRadiusKm?: number;
  description: string;
  status: SellerApplicationStatus;
  /** Set when an admin rejects or waitlists — shown back to the applicant. */
  decisionNote?: string;
  createdAt: ISODateString;
}

// ---------------------------------------------------------------------------
// Reels (short-form video)
// ---------------------------------------------------------------------------

/**
 * Which surface a reel belongs to — mirrors `ChannelKey` in `lib/channel.ts`
 * minus `full-meals` (no web menu to link into, see the channel table in
 * CLAUDE.md). Drives the card's chip colour and where its CTA points.
 */
export type ReelModule = "marketplace" | "snacks" | "laundry";

/**
 * A short vertical (9:16) video posted by a maker or by Homekrafted —
 * "behind the batch" clips, packing shots, laundry before/afters. Modeled
 * as a real row (it becomes a `Reel` table in M8, owned by a `Vendor` and
 * optionally deep-linking to one `Product`), not a UI convenience blob.
 *
 * `videoSrc` is optional on purpose: until real footage is shot, a reel
 * renders as its poster still with a play affordance, and the viewer shows
 * a "clip coming soon" state rather than a broken <video>. Never fill this
 * with generated footage — real supplied assets only (CLAUDE.md).
 */
export interface Reel {
  id: ID;
  slug: string;
  module: ReelModule;
  title: string;
  caption: string;
  /** Author line — a `Vendor.id` for maker-posted reels, absent for Homekrafted's own. */
  vendorId?: ID;
  /** Poster still label, used as the `ImageSlot` fallback + the video's a11y label. */
  posterPlaceholder: string;
  /** Real poster photo, e.g. "/images/products/besan-ladoo.jpg". */
  posterSrc?: string;
  /** Real footage, e.g. "/videos/reels/besan-ladoo.mp4". Absent until shot — see above. */
  videoSrc?: string;
  /** Runtime in seconds, shown as the card's `0:24` chip. */
  durationSeconds: number;
  likeCount: number;
  viewCount: number;
  /** Deep link out of the reel — a product, the snacks menu, the laundry booker. */
  ctaLabel: string;
  ctaHref: string;
  publishedAt: ISODateString;
}
