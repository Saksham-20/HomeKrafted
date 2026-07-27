import { LoyaltyAccount, Referral } from '@prisma/client';

export function mapReferral(referral: Referral) {
  return {
    id: referral.id,
    referrerUserId: referral.referrerUserId,
    code: referral.code,
    refereeName: referral.refereeName ?? undefined,
    refereeUserId: referral.refereeUserId ?? undefined,
    status: referral.status,
    rewardAmount: referral.rewardAmount !== null ? Number(referral.rewardAmount) : undefined,
    createdAt: referral.createdAt.toISOString(),
  };
}

export function mapLoyaltyAccount(account: LoyaltyAccount) {
  return {
    id: account.id,
    userId: account.userId,
    tier: account.tier,
    points: account.points,
    lifetimePoints: account.lifetimePoints,
    pointsToNextTier: account.pointsToNextTier ?? undefined,
  };
}
