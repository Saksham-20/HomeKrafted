import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { IdempotencyService } from '../common/idempotency/idempotency.service';
import { WalletService } from '../wallet/wallet.service';
import { mapLoyaltyAccount, mapReferral } from './referrals.mapper';

/**
 * `client/lib/data/referrals.ts#REFERRAL_REWARD_AMOUNT` — flat reward
 * credited to the referrer's wallet the first (and only) time a given
 * `Referral` row is rewarded.
 */
export const REFERRAL_REWARD_AMOUNT = 250;

/**
 * Referrals + loyalty (auth, owner-scoped). Unlike the client mock's
 * argument-less `applyReferralCredit()` (which auto-picks "the next
 * eligible referral in this session"), the real endpoint targets one
 * `Referral` id explicitly (`POST /referrals/:id/apply-credit`) — a
 * cleaner, individually-idempotent unit for "this referral pays out at
 * most once" than a stateful auto-pick would be over a real, persistent
 * table. Flagged for M8.4/Opus: the client's `applyReferralCredit()` call
 * site (`/account/referrals`'s demo button) will need to pass a specific
 * referral id once this swaps in.
 */
@Injectable()
export class ReferralsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly walletService: WalletService,
    private readonly idempotency: IdempotencyService,
  ) {}

  async getCode(userId: string): Promise<{ code: string }> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    return { code: user.referralCode };
  }

  async listMine(userId: string) {
    const rows = await this.prisma.referral.findMany({
      where: { referrerUserId: userId },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(mapReferral);
  }

  async getLoyaltyAccount(userId: string) {
    const account = await this.getOrCreateLoyaltyAccount(userId);
    return mapLoyaltyAccount(account);
  }

  private async getOrCreateLoyaltyAccount(userId: string) {
    const existing = await this.prisma.loyaltyAccount.findUnique({ where: { userId } });
    if (existing) return existing;
    return this.prisma.loyaltyAccount.create({ data: { userId } });
  }

  /**
   * Credits `REFERRAL_REWARD_AMOUNT` to the referrer's wallet
   * (`category: "referral"`) and marks the referral `rewarded` — owner-
   * scoped (`referral.referrerUserId` must equal the caller) and
   * once-only: a referral already `status: "rewarded"` throws `409`
   * rather than crediting again, enforced by re-reading the row inside
   * the same transaction the ledger write happens in (same
   * read-then-mutate-atomically shape as `OrdersService.refundOrder`).
   * `pending` referrals are eligible too (not just `joined`) — real
   * "referee completed their first order" gating is a future trigger
   * (M9), not modeled yet; both non-terminal states can be manually
   * rewarded today, mirroring the mock's `joined ?? pending` fallback.
   */
  async applyCredit(userId: string, referralId: string, idempotencyKey?: string) {
    return this.idempotency.run(userId, 'referrals.applyCredit', idempotencyKey, async (tx) => {
      const referral = await tx.referral.findUnique({ where: { id: referralId } });
      if (!referral || referral.referrerUserId !== userId) {
        throw new NotFoundException('Referral not found');
      }
      if (referral.status === 'rewarded') {
        throw new ConflictException('This referral has already been rewarded');
      }

      const wallet = await this.walletService.getOrCreateWalletTx(tx, userId);
      await this.walletService.postLedgerEntryTx(tx, {
        walletId: wallet.id,
        direction: 'credit',
        category: 'referral',
        amount: REFERRAL_REWARD_AMOUNT,
        title: `Referral credit — ${referral.refereeName ?? 'a friend'}`,
        refType: 'referral',
        refId: referral.id,
      });

      const updated = await tx.referral.update({
        where: { id: referralId },
        data: { status: 'rewarded', rewardAmount: REFERRAL_REWARD_AMOUNT },
      });

      return { referral: mapReferral(updated), rewardAmount: REFERRAL_REWARD_AMOUNT };
    });
  }
}
