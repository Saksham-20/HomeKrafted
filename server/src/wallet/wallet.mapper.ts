import { AutoTopupRule, Wallet, WalletTransaction } from '@prisma/client';

/**
 * `AutoTopupTrigger`'s Prisma enum member is declared `below_threshold`
 * (Prisma identifiers can't contain a hyphen) and `@map`'d to the DB value
 * `"below-threshold"` — Prisma Client always returns the declared
 * identifier at runtime, not the mapped DB value, same reasoning as
 * `order.mapper.ts`'s `orderStatusToFrontend`. Converts to the hyphenated
 * form `client/lib/types/wallet.ts#AutoTopupTrigger` expects.
 */
export function autoTopupTriggerToFrontend(trigger: AutoTopupRule['trigger']): 'below-threshold' | 'scheduled' {
  return trigger === 'below_threshold' ? 'below-threshold' : 'scheduled';
}

export function autoTopupTriggerToDb(trigger: 'below-threshold' | 'scheduled'): AutoTopupRule['trigger'] {
  return trigger === 'below-threshold' ? 'below_threshold' : 'scheduled';
}

export function mapWallet(wallet: Wallet) {
  return {
    id: wallet.id,
    userId: wallet.userId,
    balance: Number(wallet.balance),
    pendingCashback: Number(wallet.pendingCashback),
    lifetimeSaved: Number(wallet.lifetimeSaved),
    payWithWalletDefault: wallet.payWithWalletDefault,
    updatedAt: wallet.updatedAt.toISOString(),
  };
}

export function mapWalletTransaction(t: WalletTransaction) {
  return {
    id: t.id,
    walletId: t.walletId,
    direction: t.direction,
    category: t.category,
    amount: Number(t.amount),
    balanceAfter: Number(t.balanceAfter),
    title: t.title,
    refType: t.refType ?? undefined,
    refId: t.refId ?? undefined,
    createdAt: t.createdAt.toISOString(),
  };
}

/**
 * Why `active` is separate from `enabled`: auto-top-up is switched off
 * platform-wide (see `WalletService#maybeFireAutoTopupTx`), so a stored
 * rule can be `enabled: true` on a legacy row and still never fire.
 * Returning only `enabled` would tell every non-web client the feature
 * works. `active` is the truth; `enabled` stays the stored value so a
 * shopper can still see and clear what they configured.
 */
export const AUTO_TOPUP_UNAVAILABLE_REASON =
  'Auto top-up is paused while we move it onto a proper payment mandate. Top up manually instead.';

export function mapAutoTopupRule(rule: AutoTopupRule) {
  return {
    id: rule.id,
    walletId: rule.walletId,
    enabled: rule.enabled,
    trigger: autoTopupTriggerToFrontend(rule.trigger),
    thresholdAmount: rule.thresholdAmount !== null ? Number(rule.thresholdAmount) : undefined,
    topupAmount: Number(rule.topupAmount),
    paymentMethodRef: rule.paymentMethodRef ?? undefined,
    active: false as const,
    unavailableReason: AUTO_TOPUP_UNAVAILABLE_REASON,
  };
}
