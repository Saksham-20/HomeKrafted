import { balanceOf, isCodBlocked, deductionFor, depositableAmount } from '../../src/rider/cash-ledger';

describe('balanceOf', () => {
  it('sums a cod collection, a deposit and a deduction — hand-computed', () => {
    // +640 (collected) - 200 (deposited) - 300 (deducted at a payout) = 140
    const balance = balanceOf([{ amount: 640 }, { amount: -200 }, { amount: -300 }]);
    expect(balance).toBe(140);
  });

  it('an empty ledger balances to zero', () => {
    expect(balanceOf([])).toBe(0);
  });
});

describe('isCodBlocked', () => {
  it('is not blocked below the limit', () => {
    expect(isCodBlocked(1000, 1500)).toBe(false);
  });

  it('is NOT blocked exactly at the limit — the limit is the last rupee a rider may hold, not the first refused (matches R2\'s dispatch contract)', () => {
    expect(isCodBlocked(1500, 1500)).toBe(false);
  });

  it('is blocked over the limit', () => {
    expect(isCodBlocked(1600, 1500)).toBe(true);
  });
});

describe('deductionFor', () => {
  const now = new Date('2026-09-15T00:00:00Z');

  it('deduct_from_payout takes the whole balance when it fits inside earnings', () => {
    const deduction = deductionFor({
      mode: 'deduct_from_payout',
      entries: [{ amount: 900, createdAt: now }],
      earnings: 4000,
      now,
    });
    expect(deduction).toBe(900);
  });

  it('deduct_from_payout is capped at earnings — a debt bigger than the payout carries forward instead of going negative', () => {
    const deduction = deductionFor({
      mode: 'deduct_from_payout',
      entries: [{ amount: 5000, createdAt: now }],
      earnings: 2000,
      now,
    });
    expect(deduction).toBe(2000);
  });

  it('deduct_from_payout never goes negative when the running balance is already negative (overpaid)', () => {
    const deduction = deductionFor({
      mode: 'deduct_from_payout',
      entries: [{ amount: -500 }].map((e) => ({ ...e, createdAt: now })),
      earnings: 3000,
      now,
    });
    expect(deduction).toBe(0);
  });

  it('deposit mode only counts entries older than the 7-day grace window', () => {
    const eightDaysAgo = new Date(now.getTime() - 8 * 24 * 60 * 60 * 1000);
    const yesterday = new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000);
    const deduction = deductionFor({
      mode: 'deposit',
      entries: [
        { amount: 600, createdAt: eightDaysAgo }, // eligible — older than 7 days
        { amount: 400, createdAt: yesterday }, // still inside grace — not eligible yet
      ],
      earnings: 4000,
      now,
    });
    expect(deduction).toBe(600);
  });

  it('deposit mode entry exactly at the 7-day cutoff is eligible (<=, not <)', () => {
    const exactlySevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const deduction = deductionFor({
      mode: 'deposit',
      entries: [{ amount: 300, createdAt: exactlySevenDaysAgo }],
      earnings: 4000,
      now,
    });
    expect(deduction).toBe(300);
  });

  it('deposit mode still caps the aged balance at earnings', () => {
    const eightDaysAgo = new Date(now.getTime() - 8 * 24 * 60 * 60 * 1000);
    const deduction = deductionFor({
      mode: 'deposit',
      entries: [{ amount: 2000, createdAt: eightDaysAgo }],
      earnings: 500,
      now,
    });
    expect(deduction).toBe(500);
  });

  it('deposit mode with nothing aged past 7 days deducts nothing, even with a large fresh balance', () => {
    const deduction = deductionFor({
      mode: 'deposit',
      entries: [{ amount: 1200, createdAt: now }],
      earnings: 4000,
      now,
    });
    expect(deduction).toBe(0);
  });
});

describe('deductionFor — never charges the same cash twice', () => {
  const now = new Date('2026-09-15T00:00:00Z');
  const day = 24 * 60 * 60 * 1000;

  it('deposit mode: a recent deposit against old cash leaves nothing overdue', () => {
    // Collected ₹500 ten days ago, deposited ₹500 yesterday. Balance 0 → nothing to deduct.
    // (The first version summed only entries older than 7 days and deducted ₹500 again.)
    const deduction = deductionFor({
      mode: 'deposit',
      entries: [
        { amount: 500, createdAt: new Date(now.getTime() - 10 * day) },
        { amount: -500, createdAt: new Date(now.getTime() - 1 * day) },
      ],
      earnings: 4000,
      now,
    });
    expect(deduction).toBe(0);
  });

  it('deposit mode: partial deposit — owed 800, 300 of it collected yesterday (in grace), deposited 200 → 300 overdue', () => {
    // balance = 500 (old) + 300 (recent) - 200 (deposit) = 600; in grace = 300; overdue = 600 - 300 = 300
    const deduction = deductionFor({
      mode: 'deposit',
      entries: [
        { amount: 500, createdAt: new Date(now.getTime() - 9 * day) },
        { amount: 300, createdAt: new Date(now.getTime() - 1 * day) },
        { amount: -200, createdAt: new Date(now.getTime() - 1 * day) },
      ],
      earnings: 4000,
      now,
    });
    expect(deduction).toBe(300);
  });

  it('deduct mode: a pending (unverified) deposit is not deducted again', () => {
    // Owes 500, sent 500 by UPI, not yet verified → deduct 0.
    const deduction = deductionFor({
      mode: 'deduct_from_payout',
      entries: [{ amount: 500, createdAt: now }],
      earnings: 4000,
      now,
      pendingDeposits: 500,
    });
    expect(deduction).toBe(0);
  });

  it('deduct mode: pending deposit covers part — owes 900, 400 pending → deduct 500', () => {
    const deduction = deductionFor({
      mode: 'deduct_from_payout',
      entries: [{ amount: 900, createdAt: now }],
      earnings: 4000,
      now,
      pendingDeposits: 400,
    });
    expect(deduction).toBe(500);
  });
});

describe('depositableAmount', () => {
  it('owes 1000 with 700 already pending → 300 more may be submitted', () => {
    expect(depositableAmount(1000, 700)).toBe(300);
  });
  it('never negative', () => {
    expect(depositableAmount(200, 500)).toBe(0);
  });
});
