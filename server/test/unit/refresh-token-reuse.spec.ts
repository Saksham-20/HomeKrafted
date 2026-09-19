import { UnauthorizedException } from '@nestjs/common';
import * as crypto from 'crypto';
import { AuthService } from '../../src/auth/auth.service';

/**
 * Refresh-token reuse detection.
 *
 * Presenting a refresh token that this service has already rotated away
 * from (`revokedAt` set) is the signal a stolen-and-replayed token would
 * trip. Outside a short grace window it is acted on, not only rejected —
 * but **only against that token's own chain** (2026-09-19).
 *
 * The first version of this revoked every active refresh token the user
 * had. A stale replay is far more often somebody's own second browser tab
 * than a thief, so it took the admin's phone and every other session down
 * with it — the "admin keeps getting logged out" report. Rotation now
 * records `replacedByTokenId`, and a reuse revokes the descendants reachable
 * through it and nothing else.
 *
 * Inside the grace window, reuse reads as two tabs of the same account
 * racing the same pre-rotation token, so only that one request is rejected
 * and nothing at all is revoked.
 *
 * The Prisma stub is a small in-memory table rather than a set of
 * `jest.fn()` return values, so each assertion is about which rows ended
 * up revoked — the thing the rule is actually for.
 */

const FUTURE = new Date('2099-01-01T00:00:00Z');
const PAST = new Date('2020-01-01T00:00:00Z');
const MIN = 60_000;

interface Row {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  revokedAt: Date | null;
  replacedByTokenId: string | null;
}

function hashOf(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/** A row for `token`, defaulting to a live, unrotated one. */
function row(id: string, token: string, over: Partial<Row> = {}): Row {
  return {
    id,
    userId: 'u1',
    tokenHash: hashOf(token),
    expiresAt: FUTURE,
    revokedAt: null,
    replacedByTokenId: null,
    ...over,
  };
}

const ago = (ms: number) => new Date(Date.now() - ms);

function matches(r: Row, where: Record<string, unknown>): boolean {
  return Object.entries(where).every(([key, value]) => (r as unknown as Record<string, unknown>)[key] === value);
}

function serviceWith(rows: Row[]) {
  let created = 0;
  const refreshToken = {
    findUnique: jest.fn(async ({ where }: { where: Record<string, unknown> }) => {
      return rows.find((r) => matches(r, where)) ?? null;
    }),
    updateMany: jest.fn(
      async ({ where, data }: { where: Record<string, unknown>; data: Partial<Row> }) => {
        const hit = rows.filter((r) => matches(r, where));
        hit.forEach((r) => Object.assign(r, data));
        return { count: hit.length };
      },
    ),
    update: jest.fn(async ({ where, data }: { where: Record<string, unknown>; data: Partial<Row> }) => {
      const target = rows.find((r) => matches(r, where));
      if (!target) throw new Error('update: no such row');
      Object.assign(target, data);
      return target;
    }),
    create: jest.fn(async ({ data }: { data: Partial<Row> }) => {
      created += 1;
      const made: Row = {
        id: `new${created}`,
        userId: 'u1',
        tokenHash: '',
        expiresAt: FUTURE,
        revokedAt: null,
        replacedByTokenId: null,
        ...data,
      };
      rows.push(made);
      return made;
    }),
  };
  const prisma = {
    refreshToken,
    user: {
      findUnique: jest.fn().mockResolvedValue({ id: 'u1', role: 'consumer', suspended: false, seller: null }),
    },
    // The interactive form: the callback gets a transaction client that
    // shares the same table. A throw inside it takes back the rows *it*
    // created — tracked per transaction, not by snapshot, because two
    // transactions in flight at once (the concurrent-rotation case) must not
    // roll back each other's rows.
    $transaction: jest.fn(async (work: (tx: { refreshToken: typeof refreshToken }) => unknown) => {
      const createdHere: string[] = [];
      const tx = {
        refreshToken: {
          ...refreshToken,
          create: jest.fn(async (args: { data: Partial<Row> }) => {
            const made = await refreshToken.create(args);
            createdHere.push(made.id);
            return made;
          }),
        },
      };
      try {
        return await work(tx as unknown as { refreshToken: typeof refreshToken });
      } catch (error) {
        for (const id of createdHere) {
          const at = rows.findIndex((r) => r.id === id);
          if (at !== -1) rows.splice(at, 1);
        }
        throw error;
      }
    }),
  };
  let signed = 0;
  const jwtService = {
    verifyAsync: jest.fn().mockResolvedValue({ sub: 'u1', role: 'consumer' }),
    signAsync: jest.fn(async () => `signed-${(signed += 1)}`),
  };
  const configService = {
    get: jest.fn((key: string) => {
      if (key === 'jwt.refreshTtl') return '7d';
      if (key === 'jwt.accessTtl') return '15m';
      return 'secret';
    }),
  };
  const service = new AuthService(
    prisma as never,
    jwtService as never,
    configService as never,
    {} as never,
    {} as never,
    {} as never,
  );
  return { service, prisma, rows };
}

const byId = (rows: Row[], id: string) => rows.find((r) => r.id === id)!;

describe('refresh-token reuse detection', () => {
  describe('a stale token replayed well past the grace window', () => {
    // Laptop chain A: rtA0 -> rtA1 -> rtA2 (live). Phone chain B: rtB0 (live).
    function twoDevices() {
      return serviceWith([
        row('rtA0', 'tokenA0', { revokedAt: ago(30 * MIN), replacedByTokenId: 'rtA1' }),
        row('rtA1', 'tokenA1', { revokedAt: ago(15 * MIN), replacedByTokenId: 'rtA2' }),
        row('rtA2', 'tokenA2'),
        row('rtB0', 'tokenB0'),
      ]);
    }

    it('revokes the descendant chain of that token and returns 401', async () => {
      const { service, rows } = twoDevices();

      await expect(service.refresh('tokenA0')).rejects.toThrow(UnauthorizedException);

      // The live end of the replayed line is dead...
      expect(byId(rows, 'rtA2').revokedAt).toBeInstanceOf(Date);
    });

    it("leaves the user's other device alone", async () => {
      const { service, rows } = twoDevices();

      await expect(service.refresh('tokenA0')).rejects.toThrow(UnauthorizedException);

      // ...and the phone's session, a different chain of the same user, is
      // not. This is the assertion the old user-wide revoke failed.
      expect(byId(rows, 'rtB0').revokedAt).toBeNull();
    });

    it('does not rewrite the revocation time of tokens already rotated away', async () => {
      const { service, rows } = twoDevices();
      const before = byId(rows, 'rtA1').revokedAt;

      await expect(service.refresh('tokenA0')).rejects.toThrow(UnauthorizedException);

      expect(byId(rows, 'rtA1').revokedAt).toBe(before);
    });

    it('never revokes by user — the write is per token id', async () => {
      const { service, prisma } = twoDevices();

      await expect(service.refresh('tokenA0')).rejects.toThrow(UnauthorizedException);

      for (const [arg] of prisma.refreshToken.updateMany.mock.calls) {
        expect(arg.where).not.toHaveProperty('userId');
        expect(arg.where).toHaveProperty('id');
      }
    });

    it('never reaches the rotate-and-reissue path', async () => {
      const { service, prisma } = twoDevices();

      await expect(service.refresh('tokenA0')).rejects.toThrow(UnauthorizedException);

      expect(prisma.user.findUnique).not.toHaveBeenCalled();
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('revokes nothing beyond the presented token when the row has no recorded successor', async () => {
      // Rotated before `replacedByTokenId` was written: a chain that is not
      // recorded is not guessed at from userId — that is the user-wide
      // revoke again.
      const { service, rows } = serviceWith([
        row('old', 'oldToken', { revokedAt: ago(30 * MIN), replacedByTokenId: null }),
        row('liveSameUser', 'liveToken'),
      ]);

      await expect(service.refresh('oldToken')).rejects.toThrow(UnauthorizedException);

      expect(byId(rows, 'liveSameUser').revokedAt).toBeNull();
    });

    it('survives a dangling link (the successor row is gone)', async () => {
      const { service, rows } = serviceWith([
        row('a0', 'tokenA0', { revokedAt: ago(30 * MIN), replacedByTokenId: 'purged' }),
        row('other', 'otherToken'),
      ]);

      await expect(service.refresh('tokenA0')).rejects.toThrow(UnauthorizedException);

      expect(byId(rows, 'other').revokedAt).toBeNull();
    });

    it('terminates on a cyclic chain instead of spinning', async () => {
      const { service, prisma } = serviceWith([
        row('c0', 'tokenC0', { revokedAt: ago(30 * MIN), replacedByTokenId: 'c1' }),
        row('c1', 'tokenC1', { revokedAt: ago(20 * MIN), replacedByTokenId: 'c2' }),
        row('c2', 'tokenC2', { revokedAt: ago(10 * MIN), replacedByTokenId: 'c1' }),
      ]);

      await expect(service.refresh('tokenC0')).rejects.toThrow(UnauthorizedException);

      // One lookup by hash for the presented token, then c1 and c2 by id.
      // The visited set is what stops it there: the hop bound alone would
      // still let it re-read the loop a thousand times.
      expect(prisma.refreshToken.findUnique).toHaveBeenCalledTimes(3);
    });

    it('stops at the hop bound on a chain longer than it will follow', async () => {
      // 1,200 already-rotated links and a live tail: the bound is 1,000, so
      // the tail is deliberately out of reach — fail toward keeping the
      // session, and never loop unbounded inside a request.
      const chain: Row[] = [];
      for (let i = 0; i < 1_200; i += 1) {
        chain.push(row(`h${i}`, `tokenH${i}`, { revokedAt: ago(30 * MIN), replacedByTokenId: `h${i + 1}` }));
      }
      chain.push(row('h1200', 'tokenTail'));
      const { service, rows, prisma } = serviceWith(chain);

      await expect(service.refresh('tokenH0')).rejects.toThrow(UnauthorizedException);

      expect(byId(rows, 'h1200').revokedAt).toBeNull();
      // The presented token's own lookup, plus exactly 1,000 hops.
      expect(prisma.refreshToken.findUnique).toHaveBeenCalledTimes(1_001);
    });

    it('logs a warning naming the user and the count', async () => {
      const { service } = twoDevices();
      const warn = jest.spyOn((service as unknown as { logger: { warn: () => void } }).logger, 'warn');

      await expect(service.refresh('tokenA0')).rejects.toThrow(UnauthorizedException);

      // The line an operator greps for on the box:
      //   pm2 logs homekrafted-api | grep -E "reuse detected|same-tab race"
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('reuse detected for user u1'));
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('revoked 1 descendant'));
    });
  });

  describe('the grace window', () => {
    it('rejects a token replayed within the window and revokes nothing (a same-tab race)', async () => {
      // Rotated two seconds ago — the shape a second browser tab racing the
      // same pre-rotation token produces, not a stolen token replayed later.
      const { service, rows, prisma } = serviceWith([
        row('rt3', 'racedToken', { revokedAt: ago(2_000), replacedByTokenId: 'rt4' }),
        row('rt4', 'winnersToken'),
      ]);

      await expect(service.refresh('racedToken')).rejects.toThrow(UnauthorizedException);

      // The tab that won the race keeps its brand-new session.
      expect(byId(rows, 'rt4').revokedAt).toBeNull();
      expect(prisma.refreshToken.updateMany).not.toHaveBeenCalled();
      expect(prisma.user.findUnique).not.toHaveBeenCalled();
    });

    it('says so with its own code, which a plain dead token does not carry', async () => {
      const inside = serviceWith([row('rt3', 'racedToken', { revokedAt: ago(2_000), replacedByTokenId: 'rt4' })]);
      const insideError = await inside.service.refresh('racedToken').catch((e: unknown) => e);
      expect(insideError).toBeInstanceOf(UnauthorizedException);
      expect((insideError as UnauthorizedException).getResponse()).toMatchObject({
        code: 'REFRESH_TOKEN_ROTATED',
      });

      // Real reuse — well outside the window — and an unknown token stay the
      // plain 401: the client reads the difference as "a sibling's result is
      // coming" versus "this session is over".
      const outside = serviceWith([row('o0', 'oldToken', { revokedAt: ago(30 * MIN), replacedByTokenId: 'o1' })]);
      const outsideError = await outside.service.refresh('oldToken').catch((e: unknown) => e);
      expect((outsideError as UnauthorizedException).getResponse()).not.toHaveProperty('code');
      const unknown = serviceWith([row('x', 'other')]);
      const unknownError = await unknown.service.refresh('never-issued').catch((e: unknown) => e);
      expect((unknownError as UnauthorizedException).getResponse()).not.toHaveProperty('code');
    });

    it('logs the race so an operator can tell it from real reuse', async () => {
      const { service } = serviceWith([row('rt3', 'racedToken', { revokedAt: ago(2_000) })]);
      const log = jest.spyOn((service as unknown as { logger: { log: () => void } }).logger, 'log');

      await expect(service.refresh('racedToken')).rejects.toThrow(UnauthorizedException);

      expect(log).toHaveBeenCalledWith(expect.stringContaining('same-tab race'));
    });

    it('is exactly ten seconds: nine seconds is a race, eleven is reuse', async () => {
      const inside = serviceWith([
        row('i0', 'insideToken', { revokedAt: ago(9_000), replacedByTokenId: 'i1' }),
        row('i1', 'insideLive'),
      ]);
      await expect(inside.service.refresh('insideToken')).rejects.toThrow(UnauthorizedException);
      expect(byId(inside.rows, 'i1').revokedAt).toBeNull();

      const outside = serviceWith([
        row('o0', 'outsideToken', { revokedAt: ago(11_000), replacedByTokenId: 'o1' }),
        row('o1', 'outsideLive'),
      ]);
      await expect(outside.service.refresh('outsideToken')).rejects.toThrow(UnauthorizedException);
      expect(byId(outside.rows, 'o1').revokedAt).toBeInstanceOf(Date);
    });
  });

  describe('tokens that are not a reuse signal', () => {
    it('does not treat a merely expired (never-reused) token as reuse', async () => {
      const { service, rows, prisma } = serviceWith([
        row('rt2', 'expiredToken', { expiresAt: PAST }),
        row('other', 'otherToken'),
      ]);

      await expect(service.refresh('expiredToken')).rejects.toThrow(UnauthorizedException);

      expect(prisma.refreshToken.updateMany).not.toHaveBeenCalled();
      expect(byId(rows, 'other').revokedAt).toBeNull();
    });

    it('answers 401 and writes nothing for a token that was never issued', async () => {
      const { service, prisma, rows } = serviceWith([row('other', 'otherToken')]);

      await expect(service.refresh('unknown-token')).rejects.toThrow(UnauthorizedException);

      expect(prisma.refreshToken.updateMany).not.toHaveBeenCalled();
      expect(byId(rows, 'other').revokedAt).toBeNull();
    });

    it('answers 401 when the JWT itself does not verify, before touching the table', async () => {
      const { service, prisma } = serviceWith([row('rt1', 'anything')]);
      (service as unknown as { jwtService: { verifyAsync: jest.Mock } }).jwtService.verifyAsync.mockRejectedValueOnce(
        new Error('jwt expired'),
      );

      await expect(service.refresh('anything')).rejects.toThrow(UnauthorizedException);

      expect(prisma.refreshToken.findUnique).not.toHaveBeenCalled();
    });
  });

  describe('rotation records the chain that reuse detection walks', () => {
    it('sets replacedByTokenId on the old row, pointing at the new one', async () => {
      const { service, rows } = serviceWith([row('rt1', 'liveToken')]);

      const pair = await service.refresh('liveToken');

      const old = byId(rows, 'rt1');
      const successor = rows.find((r) => r.tokenHash === hashOf(pair.refreshToken));
      expect(old.revokedAt).toBeInstanceOf(Date);
      expect(successor).toBeDefined();
      expect(old.replacedByTokenId).toBe(successor!.id);
      expect(successor!.revokedAt).toBeNull();
    });

    it('does the write inside one transaction', async () => {
      const { service, prisma } = serviceWith([row('rt1', 'liveToken')]);

      await service.refresh('liveToken');

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    });

    it('two requests presenting the same live token rotate it once: one wins, the other is refused and leaves no successor behind', async () => {
      // Both read the row before either has written, which is what a read
      // outside the transaction allows — the stub's async steps interleave
      // the two calls one await at a time.
      const { service, rows } = serviceWith([row('rt1', 'liveToken'), row('phone', 'phoneToken')]);

      const [a, b] = await Promise.allSettled([service.refresh('liveToken'), service.refresh('liveToken')]);

      const fulfilled = [a, b].filter((r) => r.status === 'fulfilled') as PromiseFulfilledResult<{ refreshToken: string }>[];
      const rejected = [a, b].filter((r) => r.status === 'rejected') as PromiseRejectedResult[];
      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);
      expect(rejected[0].reason).toBeInstanceOf(UnauthorizedException);
      expect((rejected[0].reason as UnauthorizedException).getResponse()).toMatchObject({
        code: 'REFRESH_TOKEN_ROTATED',
      });

      // Exactly one live successor, and it is the one the old row points at.
      // Unguarded, both succeeded and the second write orphaned the first.
      const winner = rows.find((r) => r.tokenHash === hashOf(fulfilled[0].value.refreshToken))!;
      expect(winner.revokedAt).toBeNull();
      expect(byId(rows, 'rt1').replacedByTokenId).toBe(winner.id);
      const liveForThisLine = rows.filter((r) => r.revokedAt === null && r.id !== 'phone');
      expect(liveForThisLine.map((r) => r.id)).toEqual([winner.id]);
      // The other device is untouched.
      expect(byId(rows, 'phone').revokedAt).toBeNull();
    });

    it('closes the loop: a rotated token replayed later revokes what it rotated into, and not the phone', async () => {
      // Rotate a real chain twice through the service itself, age it past
      // the grace window, then replay the first token.
      const { service, rows } = serviceWith([row('r0', 'token0'), row('phone', 'phoneToken')]);

      const first = await service.refresh('token0');
      const second = await service.refresh(first.refreshToken);
      rows.forEach((r) => {
        if (r.revokedAt) r.revokedAt = ago(5 * MIN);
      });

      await expect(service.refresh('token0')).rejects.toThrow(UnauthorizedException);

      const tail = rows.find((r) => r.tokenHash === hashOf(second.refreshToken))!;
      expect(tail.revokedAt).toBeInstanceOf(Date);
      expect(byId(rows, 'phone').revokedAt).toBeNull();
    });
  });
});
