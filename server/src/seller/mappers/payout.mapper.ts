import { Payout } from '@prisma/client';

export function mapPayout(payout: Payout) {
  return {
    id: payout.id,
    sellerId: payout.sellerId,
    amount: Number(payout.amount),
    // M37 — the row's own arithmetic. Absent on pre-M37 rows, where
    // `amount` was always gross; the client renders no split rather than
    // inventing one.
    grossAmount: payout.grossAmount !== null ? Number(payout.grossAmount) : undefined,
    commissionAmount: payout.commissionAmount !== null ? Number(payout.commissionAmount) : undefined,
    commissionPct: payout.commissionPct !== null ? Number(payout.commissionPct) : undefined,
    periodStart: payout.periodStart.toISOString().slice(0, 10),
    periodEnd: payout.periodEnd.toISOString().slice(0, 10),
    status: payout.status,
    paidAt: payout.paidAt ? payout.paidAt.toISOString().slice(0, 10) : undefined,
    // M15 — the HomeKrafter's side of an admin decision. `reference` is
    // what they quote if the transfer never landed; `note` is why a
    // request was declined, which is the difference between "fix your
    // bank details and re-request" and silence.
    reference: payout.reference ?? undefined,
    note: payout.note ?? undefined,
    decidedAt: payout.decidedAt ? payout.decidedAt.toISOString().slice(0, 10) : undefined,
  };
}
