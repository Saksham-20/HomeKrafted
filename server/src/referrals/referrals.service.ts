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
   * **The referee must have a delivered order (2026-08-07 audit).** Until
   * then any non-terminal referral could be cashed on demand — the reward
   * was gated on nothing but the row existing, and `/account/referrals`
   * shipped a button that called it. That is a wallet credit a shopper
   * grants themselves, which is the same shape as the review endpoint
   * before M15 required a delivered order, and for the same reason: the
   * loop was built from one end only.
   *
   * Delivered, not placed. A place-then-cancel round trip would otherwise
   * pay ₹250 for nothing, which is exactly the hole M22 closed on
   * cashback.
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

      // An invite that never became an account cannot have ordered.
      if (!referral.refereeUserId) {
        throw new ConflictException(
          'This friend has not joined yet — the credit lands once they sign up and their first order arrives.',
        );
      }
      const firstDelivered = await tx.order.findFirst({
        where: { userId: referral.refereeUserId, status: 'delivered' },
        select: { id: true },
      });
      if (!firstDelivered) {
        throw new ConflictException(
          'The credit lands once their first order has been delivered.',
        );
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
