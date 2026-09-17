import { UnauthorizedException } from '@nestjs/common';
import { AuthService } from '../../src/auth/auth.service';

/**
 * Refresh-token reuse detection (finding [2]).
 *
 * Presenting a refresh token that this service has already rotated away
 * from (`revokedAt` set) is the signal a stolen-and-replayed token would
 * trip. Outside a short grace window it must not be *only* rejected —
 * every currently-active refresh token for that user has to be revoked
 * too, the same "burn every session" shape `changePassword`/
 * `resetPassword` already use, so a thief who rotated first does not keep
 * a working token indefinitely.
 *
 * Inside that grace window, reuse reads as two tabs of the same account
 * racing the same pre-rotation token rather than a stolen one being
 * replayed (the client's refresh token isn't synchronized across tabs),
 * so only this one request is rejected — the tab that won the race keeps
 * its brand-new session.
 */

const FUTURE = new Date('2099-01-01T00:00:00Z');
const PAST = new Date('2020-01-01T00:00:00Z');

function serviceWith(stored: Record<string, unknown> | null) {
  const prisma = {
    refreshToken: {
      findUnique: jest.fn().mockResolvedValue(stored),
      updateMany: jest.fn().mockResolvedValue({ count: 2 }),
    },
    user: {
      findUnique: jest.fn(),
    },
  };
  const jwtService = {
    verifyAsync: jest.fn().mockResolvedValue({ sub: 'u1', role: 'consumer' }),
  };
  const configService = {
    get: jest.fn().mockReturnValue('refresh-secret'),
  };
  const service = new AuthService(
    prisma as never,
    jwtService as never,
    configService as never,
    {} as never,
    {} as never,
    {} as never,
  );
  return { service, prisma, jwtService };
}

describe('refresh-token reuse detection', () => {
  it('revokes every active session for the user when a revoked token is replayed', async () => {
    const { service, prisma } = serviceWith({
      id: 'rt1',
      userId: 'u1',
      tokenHash: 'whatever',
      revokedAt: PAST,
      expiresAt: FUTURE,
    });

    await expect(service.refresh('stale-token')).rejects.toThrow(UnauthorizedException);

    expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
      where: { userId: 'u1', revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
    // Never reaches the rotate-and-reissue path.
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('does NOT mass-revoke a token replayed within the grace window (a same-tab race)', async () => {
    // Rotated two seconds ago — the shape a second browser tab racing the
    // same pre-rotation token produces, not a stolen token replayed later.
    const revokedAt = new Date(Date.now() - 2_000);
    const { service, prisma } = serviceWith({
      id: 'rt3',
      userId: 'u1',
      tokenHash: 'whatever',
      revokedAt,
      expiresAt: FUTURE,
    });

    await expect(service.refresh('raced-token')).rejects.toThrow(UnauthorizedException);

    // This one request is refused, but every other active session for the
    // user — including the tab that won the race — must survive it.
    expect(prisma.refreshToken.updateMany).not.toHaveBeenCalled();
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('still mass-revokes a token replayed well past the grace window (real reuse)', async () => {
    // Rotated a minute ago — far outside any plausible cross-tab race.
    const revokedAt = new Date(Date.now() - 60_000);
    const { service, prisma } = serviceWith({
      id: 'rt4',
      userId: 'u1',
      tokenHash: 'whatever',
      revokedAt,
      expiresAt: FUTURE,
    });

    await expect(service.refresh('stolen-token')).rejects.toThrow(UnauthorizedException);

    expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
      where: { userId: 'u1', revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('does not treat a merely expired (never-reused) token as a reuse signal', async () => {
    const { service, prisma } = serviceWith({
      id: 'rt2',
      userId: 'u1',
      tokenHash: 'whatever',
      revokedAt: null,
      expiresAt: PAST,
    });

    await expect(service.refresh('expired-token')).rejects.toThrow(UnauthorizedException);

    expect(prisma.refreshToken.updateMany).not.toHaveBeenCalled();
  });

  it('does not call updateMany for a token that was never issued', async () => {
    const { service, prisma } = serviceWith(null);

    await expect(service.refresh('unknown-token')).rejects.toThrow(UnauthorizedException);

    expect(prisma.refreshToken.updateMany).not.toHaveBeenCalled();
  });
});
