import type { LoyaltyAccount, LoyaltyTier, Referral } from "@/lib/types";

/**
 * Current invite reward rate — what the demo "apply referral credit"
 * button on `/account/referrals` credits today. Kept separate from
 * `referrals[0]`'s historical `rewardAmount` (₹100, matching the existing
 * "Referral credit — Priya" row already seeded in `lib/data/wallet.ts`'s
 * ledger) — reward rates can change over time in a real program, and
 * rewriting an already-settled ledger row to match a new rate would be
 * wrong.
 */
export const REFERRAL_REWARD_AMOUNT = 250;

/**
 * Referrals sent by the demo user, exercising all 3 `ReferralStatus`
 * values: `rewarded` (reconciles with `wt4` in `lib/data/wallet.ts`),
 * `joined` (signed up, hasn't completed a first order yet — reward not
 * yet triggered), and `pending` (invited, hasn't signed up). The
 * `applyReferralCredit` mock mutation (`lib/api/referrals.ts`) advances
 * the oldest non-rewarded row to `rewarded` — that's the one the
 * Referrals screen's demo button progresses.
 */
export const referrals: Referral[] = [
  {
    id: "ref1",
    referrerUserId: "user-demo",
    code: "ANANYA250",
    refereeName: "Priya Menon",
    refereeUserId: "user-priya",
    status: "rewarded",
    rewardAmount: 100,
    createdAt: "2026-07-10",
  },
  {
    id: "ref2",
    referrerUserId: "user-demo",
    code: "ANANYA250",
    refereeName: "Karthik Rao",
    refereeUserId: "user-karthik",
    status: "joined",
    createdAt: "2026-07-20",
  },
  {
    id: "ref3",
    referrerUserId: "user-demo",
    code: "ANANYA250",
    refereeName: "Divya Shetty",
    status: "pending",
    createdAt: "2026-07-24",
  },
];

/** One row per `LoyaltyTier`, ordered — `lifetimePoints` threshold to reach it, plus display copy for the tier ladder on `/account/referrals`. */
export interface LoyaltyTierInfo {
  tier: LoyaltyTier;
  label: string;
  threshold: number;
  perk: string;
}

export const LOYALTY_TIERS: LoyaltyTierInfo[] = [
  { tier: "bronze", label: "Bronze", threshold: 0, perk: "Base cashback on every order" },
  { tier: "silver", label: "Silver", threshold: 1000, perk: "+0.5% extra cashback · priority support" },
  { tier: "gold", label: "Gold", threshold: 2500, perk: "+1% extra cashback · early sale access" },
  { tier: "platinum", label: "Platinum", threshold: 5000, perk: "+1.5% extra cashback · free gift wrap, always" },
];

/**
 * Seeded loyalty account for the demo user — `lifetimePoints: 1820` sits
 * inside the Silver band (1000–2499), matching `tier: "silver"` and
 * `pointsToNextTier: 680` (2500 − 1820) below. `points` is the current
 * *redeemable* balance (separate from the cumulative, tier-determining
 * `lifetimePoints`) — some of it was already redeemed for wallet credit,
 * matching `wt8` ("Loyalty points redeemed for wallet credit") in
 * `lib/data/wallet.ts`.
 */
export const loyaltyAccount: LoyaltyAccount = {
  id: "loyalty-demo",
  userId: "user-demo",
  tier: "silver",
  points: 640,
  lifetimePoints: 1820,
  pointsToNextTier: 680,
};

export interface HowItWorksStep {
  title: string;
  description: string;
}

export const referralHowItWorks: HowItWorksStep[] = [
  {
    title: "Share your code",
    description: "Send your referral code or link to a friend via WhatsApp, SMS or email.",
  },
  {
    title: "They sign up & order",
    description: "Once they create an account and place their first order, the invite counts.",
  },
  {
    title: "You both get credited",
    description: `₹${REFERRAL_REWARD_AMOUNT} lands in each of your wallets — no expiry, usable on any module.`,
  },
  {
    title: "Earn loyalty points too",
    description: "Every order earns points toward Silver, Gold and Platinum tiers — better cashback at each step.",
  },
];
