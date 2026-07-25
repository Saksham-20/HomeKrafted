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
export type SellerApplicationStatus = "new" | "reviewing" | "waitlisted";

export interface SellerApplication {
  id: ID;
  businessName: string;
  contactName: string;
  email: string;
  phone: string;
  category: SellerApplicationCategory;
  city: string;
  description: string;
  status: SellerApplicationStatus;
  createdAt: ISODateString;
}
