import { ReferralsClient } from "@/components/account/ReferralsClient";
import { getLoyaltyTiers, getReferralHowItWorks, getReferralRewardAmount } from "@/lib/api";

/**
 * `/account/referrals` (M7b; M8.4a swap) — only the static
 * tiers/how-it-works/reward-amount copy stays server-fetched here;
 * `code`/referrals/loyalty account are owner-scoped real reads now,
 * fetched by `ReferralsClient` itself on mount.
 */
export default async function ReferralsPage() {
  const [tiers, howItWorks, rewardAmount] = await Promise.all([
    getLoyaltyTiers(),
    getReferralHowItWorks(),
    getReferralRewardAmount(),
  ]);

  return <ReferralsClient tiers={tiers} howItWorks={howItWorks} rewardAmount={rewardAmount} />;
}
