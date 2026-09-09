/**
 * The referral programme's static copy: the reward rate, the tier ladder
 * and the four "how this works" steps.
 *
 * **This is display content, not a fixture, and that is why it moved
 * here (2026-09-06).** It lived in `lib/data/referrals.ts` beside the
 * demo user's own seeded referrals and loyalty account, and
 * `getLoyaltyTiers`, `getReferralHowItWorks` and
 * `getReferralRewardAmount` returned it **unconditionally** — with no
 * `isMockMode()` branch, because it is the same on both sides. The
 * native app resolves everything under `lib/data/` to a throwing stub
 * (nothing there ships to a phone), so those three functions threw on a
 * device while compiling, typechecking and passing every test.
 *
 * `lib/data/referrals.ts` re-exports these names, so nothing that
 * imported them from there has to change.
 *
 * Two rules if you edit this:
 *
 * - **`REFERRAL_REWARD_AMOUNT` is the current rate, never a historical
 *   one.** A settled `Referral.rewardAmount` is what was actually paid
 *   and stays whatever it was; rewriting an already-credited ledger row
 *   to match a new rate would be wrong.
 * - **The tiers are ordered and their thresholds are `lifetimePoints`,**
 *   which is cumulative — separate from `points`, the redeemable
 *   balance. A screen showing progress reads the gap between two
 *   thresholds, never the redeemable number.
 */
import type { LoyaltyTier } from "@/lib/types";

/** Current invite reward rate — what a completed referral credits to each wallet. */
export const REFERRAL_REWARD_AMOUNT = 250;

/** One row per `LoyaltyTier`, ordered — the `lifetimePoints` needed to reach it, plus its display copy. */
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
