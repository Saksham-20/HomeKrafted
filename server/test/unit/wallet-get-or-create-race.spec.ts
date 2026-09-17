import { WalletService } from '../../src/wallet/wallet.service';

/**
 * `Wallet.userId` is `@unique`. Two concurrent first-time calls for the
 * same brand-new user both `findUnique` and see nothing, then both attempt
 * to insert. `getOrCreateWalletTx`/`getOrCreateWallet` now insert with
 * `INSERT ... ON CONFLICT ("userId") DO NOTHING` — a single statement that
 * cannot itself raise on the losing side of the race — followed by an
 * ordinary `findUniqueOrThrow`, rather than a `wallet.create()` guarded by
 * a catch-P2002 fallback.
 *
 * **This mock cannot exercise the bug the raw-SQL rewrite actually fixes.**
 * A stub `tx` object has no transaction-abort semantics: under real
 * Postgres, once a statement inside a transaction errors (the old
 * `create()`'s unique-constraint violation), the whole transaction is
 * marked aborted and every later statement on that same `tx` — including a
 * fallback `findUniqueOrThrow` — fails with 25P02, "current transaction is
 * aborted". These specs only pin the request/response shape (which calls
 * happen, in what order, with what arguments) against a real Postgres
 * connection; see `test/e2e/money-races.e2e-spec.ts`'s "a wallet is
 * created exactly once for a brand-new user under concurrent requests"
 * block for the real-DB regression test that actually reproduces the abort.
 */
describe('WalletService#getOrCreateWalletTx', () => {
  function service() {
    return new WalletService({} as never, {} as never, {} as never);
  }

  it('returns the existing wallet without attempting an insert', async () => {
    const wallet = { id: 'w1', userId: 'u1' };
    const tx = {
      wallet: {
        findUnique: jest.fn().mockResolvedValue(wallet),
        findUniqueOrThrow: jest.fn(),
      },
      $executeRaw: jest.fn(),
    };

    const result = await service().getOrCreateWalletTx(tx as never, 'u1');

    expect(result).toBe(wallet);
    expect(tx.$executeRaw).not.toHaveBeenCalled();
    expect(tx.wallet.findUniqueOrThrow).not.toHaveBeenCalled();
  });

  it('inserts with ON CONFLICT DO NOTHING then reads back the row when none exists', async () => {
    const created = { id: 'w1', userId: 'u1' };
    const tx = {
      wallet: {
        findUnique: jest.fn().mockResolvedValue(null),
        findUniqueOrThrow: jest.fn().mockResolvedValue(created),
      },
      $executeRaw: jest.fn().mockResolvedValue(1),
    };

    const result = await service().getOrCreateWalletTx(tx as never, 'u1');

    expect(result).toBe(created);
    expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
    expect(tx.wallet.findUniqueOrThrow).toHaveBeenCalledWith({ where: { userId: 'u1' } });
  });

  it('reads back the winner\'s row when a concurrent insert wins the race (ON CONFLICT DO NOTHING is a no-op)', async () => {
    const winnerRow = { id: 'w1', userId: 'u1' };
    const tx = {
      wallet: {
        findUnique: jest.fn().mockResolvedValue(null),
        // A real Postgres `INSERT ... ON CONFLICT DO NOTHING` never
        // rejects on the losing side — it resolves having inserted zero
        // rows. Modeled here as a plain resolve, same as the winning case,
        // because from this method's point of view the two are
        // indistinguishable: either way the next `findUniqueOrThrow` is
        // what actually answers "whose row is this".
        findUniqueOrThrow: jest.fn().mockResolvedValue(winnerRow),
      },
      $executeRaw: jest.fn().mockResolvedValue(0),
    };

    const result = await service().getOrCreateWalletTx(tx as never, 'u1');

    expect(result).toBe(winnerRow);
    expect(tx.wallet.findUniqueOrThrow).toHaveBeenCalledWith({ where: { userId: 'u1' } });
  });
});

describe('WalletService#getOrCreateWallet (non-tx)', () => {
  it('returns the existing wallet without attempting an insert', async () => {
    const wallet = { id: 'w1', userId: 'u1' };
    const prisma = {
      wallet: {
        findUnique: jest.fn().mockResolvedValue(wallet),
        findUniqueOrThrow: jest.fn(),
      },
      $executeRaw: jest.fn(),
    };
    const service = new WalletService(prisma as never, {} as never, {} as never);

    const result = await service.getOrCreateWallet('u1');

    expect(result).toBe(wallet);
    expect(prisma.$executeRaw).not.toHaveBeenCalled();
  });

  it('inserts with ON CONFLICT DO NOTHING then reads back the row on a concurrent create race', async () => {
    const winnerRow = { id: 'w1', userId: 'u1' };
    const prisma = {
      wallet: {
        findUnique: jest.fn().mockResolvedValue(null),
        findUniqueOrThrow: jest.fn().mockResolvedValue(winnerRow),
      },
      $executeRaw: jest.fn().mockResolvedValue(0),
    };
    const service = new WalletService(prisma as never, {} as never, {} as never);

    const result = await service.getOrCreateWallet('u1');

    expect(result).toBe(winnerRow);
    expect(prisma.wallet.findUniqueOrThrow).toHaveBeenCalledWith({ where: { userId: 'u1' } });
  });
});
