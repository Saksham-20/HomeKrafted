import type { LoyaltyAccount, Referral } from "@/lib/types";
import {
  LOYALTY_TIERS,
  REFERRAL_REWARD_AMOUNT,
  currentUser,
  loyaltyAccount,
  referralHowItWorks,
  referrals,
  type HowItWorksStep,
  type LoyaltyTierInfo,
} from "@/lib/data";

export async function getReferralCode(): Promise<string> {
  return currentUser.referralCode;
}

export async function getReferrals(): Promise<Referral[]> {
  return referrals;
}

export async function getLoyaltyAccount(): Promise<LoyaltyAccount> {
  return loyaltyAccount;
}

export async function getLoyaltyTiers(): Promise<LoyaltyTierInfo[]> {
  return LOYALTY_TIERS;
}

export async function getReferralHowItWorks(): Promise<HowItWorksStep[]> {
  return referralHowItWorks;
}

export async function getReferralRewardAmount(): Promise<number> {
  return REFERRAL_REWARD_AMOUNT;
}

export interface ApplyReferralCreditResult {
  referral: Referral;
  rewardAmount: number;
}

/**
 * Mock "a friend just accepted your invite" mutation — the demo button on
 * `/account/referrals`. Advances the oldest non-`rewarded` referral
 * (preferring one already `joined` over a merely `pending` one, since
 * that's closer to the real trigger — a completed first order) to
 * `status: "rewarded"` with `rewardAmount: REFERRAL_REWARD_AMOUNT`,
 * mutating the shared `referrals` array in place (same session-scoped
 * mock-mutation pattern as `lib/api/addresses.ts`). Returns `null` when
 * every referral is already rewarded, so the caller can disable the
 * button / show an empty state instead of crediting an unbounded number
 * of times.
 *
 * This only updates the `Referral` row — the actual wallet credit is a
 * separate step the caller makes via `useWallet().earnReferralCredit()`,
 * keeping every ledger-mutating write going through `WalletContext` (the
 * one place `balanceAfter` gets computed), the same division of
 * responsibility `CheckoutClient`/`LaundryBookingClient` already use
 * between `createOrder`/`createBooking` and `pay`/`earnCashback`.
 */
export async function applyReferralCredit(): Promise<ApplyReferralCreditResult | null> {
  const target =
    referrals.find((r) => r.status === "joined") ?? referrals.find((r) => r.status === "pending");
  if (!target) return null;

  target.status = "rewarded";
  target.rewardAmount = REFERRAL_REWARD_AMOUNT;

  return { referral: target, rewardAmount: REFERRAL_REWARD_AMOUNT };
}
