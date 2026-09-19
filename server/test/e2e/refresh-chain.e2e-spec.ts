import * as crypto from 'crypto';
import { API_PREFIX, Harness, createHarness, resetDatabase } from './harness';

/**
 * Refresh-token chains, against a real database (2026-09-19).
 *
 * The unit spec (`test/unit/refresh-token-reuse.spec.ts`) drives the service
 * over an in-memory table. What only a real one can show is that the rotation
 * transaction really writes `replacedByTokenId`, that the walk follows those
 * links through actual rows, and — the point of the whole change — that a
 * stale replay kills one chain and leaves the user's other session working.
 *
 * Backdating `revokedAt` stands in for the passage of time: the grace window
 * is ten seconds and a test that slept through it would be a slow test for
 * nothing.
 */
describe('refresh-token chains', () => {
  let h: Harness;

  beforeAll(async () => {
    h = await createHarness();
  });

  afterAll(async () => {
    await h.close();
  });

  beforeEach(async () => {
    await resetDatabase(h);
  });

  const sha256 = (value: string) => crypto.createHash('sha256').update(value).digest('hex');
  const rowFor = (refreshToken: string) =>
    h.prisma.refreshToken.findUniqueOrThrow({ where: { tokenHash: sha256(refreshToken) } });

  const PASSWORD = 'test-password-123';

  /** One account, two sessions — a laptop and a phone. */
  async function twoDevices() {
    const email = `chain-${Date.now()}-${Math.round(Math.random() * 1e6)}@example.test`;
    const laptop = await h
      .api()
      .post(`${API_PREFIX}/auth/register`)
      .send({ name: 'Chain Admin', email, password: PASSWORD })
      .expect(201);
    const phone = await h.api().post(`${API_PREFIX}/auth/login`).send({ email, password: PASSWORD }).expect(200);
    return {
      laptop: laptop.body.refreshToken as string,
      phone: phone.body.refreshToken as string,
      userId: laptop.body.user.id as string,
    };
  }

  const refresh = (refreshToken: string) =>
    h.api().post(`${API_PREFIX}/auth/refresh`).send({ refreshToken });

  /** Age every already-rotated token past the reuse grace window. */
  const ageRotatedTokens = (userId: string) =>
    h.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: { not: null } },
      data: { revokedAt: new Date(Date.now() - 5 * 60_000) },
    });

  it('links each rotated token to the one that replaced it', async () => {
    const { laptop } = await twoDevices();

    const rotated = await refresh(laptop).expect(200);

    const old = await rowFor(laptop);
    const successor = await rowFor(rotated.body.refreshToken);
    expect(old.revokedAt).not.toBeNull();
    expect(old.replacedByTokenId).toBe(successor.id);
    expect(successor.revokedAt).toBeNull();
  });

  it('a stale token replayed past the grace window ends its own chain and not the other device', async () => {
    const { laptop, phone, userId } = await twoDevices();

    const second = await refresh(laptop).expect(200);
    const third = await refresh(second.body.refreshToken).expect(200);
    await ageRotatedTokens(userId);

    // The stale first token comes back — a second tab, or a thief.
    await refresh(laptop).expect(401);

    // Everything the laptop line rotated into is dead...
    await refresh(third.body.refreshToken).expect(401);
    // ...and the phone, a different chain of the same account, still works.
    // This is what the user-wide revoke got wrong.
    await refresh(phone).expect(200);
  });

  it('a replay inside the grace window is a race: refused, and nothing is revoked', async () => {
    const { laptop } = await twoDevices();

    const rotated = await refresh(laptop).expect(200);
    // Immediately: the losing tab's request, ten seconds not yet elapsed.
    await refresh(laptop).expect(401);

    // The tab that won the race keeps its session.
    await refresh(rotated.body.refreshToken).expect(200);
  });

  it('two simultaneous refreshes of one token rotate it once: one 200, one 401, and one live successor', async () => {
    const { laptop, phone, userId } = await twoDevices();

    const [a, b] = await Promise.all([refresh(laptop), refresh(laptop)]);

    const statuses = [a.status, b.status].sort();
    expect(statuses).toEqual([200, 401]);
    // The refused one says why, in the code a client waits on.
    const loser = a.status === 401 ? a : b;
    expect(loser.body.error.code).toBe('REFRESH_TOKEN_ROTATED');
    const winner = a.status === 200 ? a : b;

    // The laptop line has exactly one live token — the winner's — and the
    // old row points at it. Two live successors with the first orphaned from
    // the chain is what an unguarded rotation produced.
    const live = await h.prisma.refreshToken.findMany({ where: { userId, revokedAt: null } });
    expect(live.map((r) => r.tokenHash).sort()).toEqual(
      [sha256(winner.body.refreshToken), sha256(phone)].sort(),
    );
    expect((await rowFor(laptop)).replacedByTokenId).toBe((await rowFor(winner.body.refreshToken)).id);
  });

  it('a token rotated before chains were recorded revokes nothing beyond itself', async () => {
    const { laptop, userId } = await twoDevices();

    const rotated = await refresh(laptop).expect(200);
    // The shape of every row rotated before this deploy: revoked, no successor.
    await h.prisma.refreshToken.update({
      where: { id: (await rowFor(laptop)).id },
      data: { replacedByTokenId: null },
    });
    await ageRotatedTokens(userId);

    await refresh(laptop).expect(401);

    // Failing toward keeping people signed in: the live token survives.
    await refresh(rotated.body.refreshToken).expect(200);
  });
});
