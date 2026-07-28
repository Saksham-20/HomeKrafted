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
import { getSessionUser } from "@/lib/auth/session";
import { http, isMockMode } from "./http";

/** Referrals & loyalty (M8.4a — real). Owner-scoped (`docs/API.md` "Referrals & loyalty (M8.3a)"). */

export async function getReferralCode(): Promise<string> {
  if (isMockMode()) return currentUser.referralCode;
  const cached = getSessionUser()?.referralCode;
  if (cached) return cached;
  const { code } = await http.get<{ code: string }>("/referrals/code");
  return code;
}

export async function getReferrals(): Promise<Referral[]> {
  if (isMockMode()) return referrals;
  return http.get<Referral[]>("/referrals");
}

export async function getLoyaltyAccount(): Promise<LoyaltyAccount> {
  if (isMockMode()) return loyaltyAccount;
  return http.get<LoyaltyAccount>("/loyalty");
}

/** Static tier ladder copy — no endpoint (tier thresholds/perks are display content, not per-user data). */
export async function getLoyaltyTiers(): Promise<LoyaltyTierInfo[]> {
  return LOYALTY_TIERS;
}

/** Static copy — not an endpoint. */
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
 * Mock mode: "a friend just accepted your invite" demo button — advances
 * the oldest non-`rewarded` referral in place, same as pre-M8.4a.
 *
 * Real mode: `POST /referrals/:id/apply-credit` — **shape change** flagged
 * in `docs/API.md`: the real endpoint targets one `Referral` id explicitly
 * (owner-scoped, once-only via a `409` on an already-`rewarded` referral)
 * rather than auto-picking "the next eligible one." `ReferralsClient`
 * picks the same "oldest `joined`, else oldest `pending`" referral
 * client-side and passes its id here — same effective UX as before, real
 * endpoint underneath. Credits the wallet **server-side** as part of the
 * same call (`WalletService.postLedgerEntryTx`), so the caller no longer
 * makes a separate `useWallet().earnReferralCredit()` write — it just
 * refreshes the wallet balance afterward.
 */
export async function applyReferralCredit(
  referralId?: string,
): Promise<ApplyReferralCreditResult | null> {
  if (isMockMode()) {
    const target =
      referrals.find((r) => r.status === "joined") ?? referrals.find((r) => r.status === "pending");
    if (!target) return null;

    target.status = "rewarded";
    target.rewardAmount = REFERRAL_REWARD_AMOUNT;

    return { referral: target, rewardAmount: REFERRAL_REWARD_AMOUNT };
  }

  if (!referralId) return null;
  const referral = await http.post<Referral>(`/referrals/${encodeURIComponent(referralId)}/apply-credit`);
  return { referral, rewardAmount: referral.rewardAmount ?? REFERRAL_REWARD_AMOUNT };
}
