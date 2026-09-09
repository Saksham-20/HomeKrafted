import type { LoyaltyAccount, Referral } from "@/lib/types";

/*
  The reward rate, the tier ladder and the "how this works" steps moved to
  `lib/referrals/loyalty-copy.ts` on 2026-09-06. They are display copy
  returned unconditionally — no `isMockMode()` branch — and the native app
  resolves this whole directory to a throwing stub, so three `lib/api`
  functions threw on a device while passing every check here. Re-exported
  so nothing importing them from `@/lib/data` has to change.
*/
export {
  LOYALTY_TIERS,
  REFERRAL_REWARD_AMOUNT,
  referralHowItWorks,
  type HowItWorksStep,
  type LoyaltyTierInfo,
} from "@/lib/referrals/loyalty-copy";


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

