import { ReferralsClient } from "@/components/account/ReferralsClient";
import {
  getLoyaltyAccount,
  getLoyaltyTiers,
  getReferralCode,
  getReferralHowItWorks,
  getReferralRewardAmount,
  getReferrals,
} from "@/lib/api";

/** `/account/referrals` (M7b) — server data fetch, interactive UI lives in `ReferralsClient`. */
export default async function ReferralsPage() {
  const [code, referrals, loyaltyAccount, tiers, howItWorks, rewardAmount] = await Promise.all([
    getReferralCode(),
    getReferrals(),
    getLoyaltyAccount(),
    getLoyaltyTiers(),
    getReferralHowItWorks(),
    getReferralRewardAmount(),
  ]);

  return (
    <ReferralsClient
      code={code}
      initialReferrals={referrals}
      loyaltyAccount={loyaltyAccount}
      tiers={tiers}
      howItWorks={howItWorks}
      rewardAmount={rewardAmount}
    />
  );
}
