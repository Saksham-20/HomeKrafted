import { Payout } from '@prisma/client';

export function mapPayout(payout: Payout) {
  return {
    id: payout.id,
    sellerId: payout.sellerId,
    amount: Number(payout.amount),
    periodStart: payout.periodStart.toISOString().slice(0, 10),
    periodEnd: payout.periodEnd.toISOString().slice(0, 10),
    status: payout.status,
    paidAt: payout.paidAt ? payout.paidAt.toISOString().slice(0, 10) : undefined,
  };
}
