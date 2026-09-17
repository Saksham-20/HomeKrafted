import { ConflictException } from '@nestjs/common';
import { AdminSellersService } from '../../src/admin/sellers.service';

/**
 * `approveApplication` reuses an existing `User` row by email — the
 * ordinary case is somebody who already has a consumer account. Ways that
 * reuse could go wrong, each fixed here:
 *
 * 1. A phone collision with a *different* account crashed the transaction
 *    with a raw 500 instead of a named refusal — but only on the branch
 *    that actually writes `User.phone` (minting a brand new account). The
 *    reuse-by-email branch never touches that column, so it must never be
 *    refused over a phone collision it could not possibly hit — including
 *    when the reused account's *own* phone differs from the one typed on
 *    this application and that typed number happens to belong to some
 *    unrelated third user.
 * 2. Reusing an account whose role was neither `consumer` nor `seller`
 *    (e.g. a rider) minted an approved `Seller` row pointing at an
 *    account that could never reach `/seller/*`.
 * 3. Reusing an account that already had a working password silently
 *    overwrote it and killed every open session — `issueTemporaryPassword`
 *    is right for a fresh phone-only account and a takeover for anyone
 *    else.
 */

function baseApplication(overrides: Record<string, unknown> = {}) {
  return {
    id: 'app1',
    businessName: 'Candle & Clay',
    contactName: 'Jamie Kaur',
    email: 'jamie@example.com',
    phone: '+919000011199',
    category: 'maker',
    specialties: ['crafts'],
    city: 'Chandigarh',
    // A curated area, so `resolvePlacement` succeeds without touching the
    // pincode table.
    area: 'chd-sector-34',
    pincode: null,
    areaLabel: null,
    deliveryRadiusKm: null,
    description: 'Hand-poured soy candles.',
    instagramUrl: null,
    websiteUrl: null,
    fssaiNumber: null,
    yearsMaking: null,
    capacityPerDay: null,
    addressLine1: null,
    addressLine2: null,
    landmark: null,
    pickupPhone: null,
    status: 'new',
    decisionNote: null,
    createdAt: new Date('2026-09-01T00:00:00Z'),
    ...overrides,
  };
}

function serviceWith(opts: {
  application?: Record<string, unknown>;
  existingSeller?: unknown;
  phoneOwner?: { id: string; email: string | null } | null;
  reusedUser?: Record<string, unknown> | null;
}) {
  const application = opts.application ?? baseApplication();

  const tx = {
    user: {
      // The service now makes two distinct `tx.user.findUnique` calls: one
      // keyed on email (the reuse lookup) and — only on the branch that
      // finds no email match — a second keyed on phone (the collision
      // guard, gated to run just before `tx.user.create`). Distinguishing
      // them by `where` is what lets a test assert the guard is skipped
      // entirely when an email match reuses the account.
      findUnique: jest.fn().mockImplementation(({ where }: { where: { email?: string; phone?: string } }) => {
        if (where.email !== undefined) return Promise.resolve(opts.reusedUser ?? null);
        if (where.phone !== undefined) return Promise.resolve(opts.phoneOwner ?? null);
        return Promise.resolve(null);
      }),
      update: jest.fn().mockImplementation(({ where, data }: { where: { id: string }; data: Record<string, unknown> }) =>
        Promise.resolve({ ...(opts.reusedUser ?? {}), id: where.id, ...data }),
      ),
      create: jest.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve({ id: 'new-user', passwordHash: null, role: 'seller', ...data }),
      ),
    },
    wallet: { create: jest.fn().mockResolvedValue({}) },
    loyaltyAccount: { create: jest.fn().mockResolvedValue({}) },
    vendor: {
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve({
          id: 'vend1',
          rating: null,
          reviewCount: 0,
          followerCount: 0,
          joinedAt: new Date('2026-09-01T00:00:00Z'),
          discountPct: null,
          discountEndsAt: null,
          avatarSrc: null,
          bannerSrc: null,
          ...data,
        }),
      ),
    },
    seller: {
      create: jest.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve({
          id: 'seller1',
          createdAt: new Date('2026-09-01T00:00:00Z'),
          rating: null,
          reviewCount: null,
          ...data,
        }),
      ),
    },
    vendorProfile: { create: jest.fn().mockResolvedValue({}) },
    sellerApplication: {
      update: jest.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve({ ...application, ...data }),
      ),
    },
  };

  const prisma = {
    sellerApplication: { findUnique: jest.fn().mockResolvedValue(application) },
    seller: {
      findFirst: jest.fn().mockResolvedValue(opts.existingSeller ?? null),
      // Read back by `issueTemporaryPassword`, which runs on the *outer*
      // prisma client (its own transaction, separate from approval's).
      findUnique: jest.fn().mockResolvedValue({
        id: 'seller1',
        userId: (opts.reusedUser?.id as string | undefined) ?? 'new-user',
        status: 'approved',
        user: {
          id: (opts.reusedUser?.id as string | undefined) ?? 'new-user',
          email: application.email,
          phone: application.phone,
          suspended: false,
        },
      }),
    },
    // Not read by `approveApplication` any more — the phone-collision
    // lookup now runs on `tx.user.findUnique` (see above), gated to the
    // branch that is actually about to create a `User`.
    user: {
      findUnique: jest.fn().mockResolvedValue(null),
      update: jest.fn().mockResolvedValue({}),
    },
    refreshToken: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
    // Handles both shapes real Prisma accepts: a callback (interactive
    // transaction, used by `approveApplication`) and an array of promises
    // (batch form, used by `issueTemporaryPassword`).
    $transaction: jest.fn().mockImplementation((arg: unknown) => {
      if (typeof arg === 'function') return (arg as (t: unknown) => unknown)(tx);
      if (Array.isArray(arg)) return Promise.all(arg);
      return Promise.resolve(arg);
    }),
  };

  const settings = { get: jest.fn().mockResolvedValue({ defaultDeliveryRadiusKm: 5 }) };
  const sellerInvite = {
    sendApprovalInvite: jest.fn().mockResolvedValue({
      email: { attempted: false, delivered: false, stubbed: false },
      sms: { attempted: false, delivered: false, stubbed: false },
      reached: false,
    }),
  };
  const notifications = { deliver: jest.fn().mockResolvedValue(undefined) };
  const auditLog = { log: jest.fn().mockResolvedValue(undefined) };
  const vendorProfiles = {};

  const service = new AdminSellersService(
    prisma as never,
    auditLog as never,
    sellerInvite as never,
    notifications as never,
    vendorProfiles as never,
    settings as never,
  );

  return { service, tx, prisma, sellerInvite, notifications, auditLog };
}

describe('AdminSellersService#approveApplication — account reuse', () => {
  it('(b) refuses with a named conflict when creating a new user and the typed phone belongs to an existing user', async () => {
    const { service, tx } = serviceWith({
      // No email match, so this takes the create-a-new-`User` branch —
      // the one that actually writes `User.phone` and can hit the real
      // `P2002`.
      reusedUser: null,
      phoneOwner: { id: 'someone-else', email: 'not-jamie@example.com' },
    });

    await expect(service.approveApplication('admin1', 'app1')).rejects.toThrow(ConflictException);
    await expect(service.approveApplication('admin1', 'app1')).rejects.toThrow(/already registered/);
    // Refused before the write it would otherwise crash.
    expect(tx.user.create).not.toHaveBeenCalled();
  });

  it('(a) reuses an existing consumer account by email even when the typed phone collides with an unrelated third user', async () => {
    // The reused account's own phone differs from what was typed on this
    // application, and that typed number happens to belong to some
    // unrelated third user. The reuse branch never writes `User.phone`,
    // so it must never hit the phone-collision guard at all.
    const { service, tx } = serviceWith({
      reusedUser: { id: 'u1', email: 'jamie@example.com', phone: '+919000000001', role: 'consumer', passwordHash: null },
      phoneOwner: { id: 'someone-else', email: 'third-party@example.com' },
    });

    await expect(service.approveApplication('admin1', 'app1')).resolves.toBeDefined();
    expect(tx.user.update).toHaveBeenCalledWith({ where: { id: 'u1' }, data: { role: 'seller' } });
    expect(tx.user.create).not.toHaveBeenCalled();
  });

  it('does not refuse when the phone belongs to the same account being reused', async () => {
    const { service, prisma } = serviceWith({
      phoneOwner: { id: 'u1', email: 'jamie@example.com' },
      reusedUser: { id: 'u1', email: 'jamie@example.com', role: 'consumer', passwordHash: null },
    });

    await expect(service.approveApplication('admin1', 'app1')).resolves.toBeDefined();
    expect(prisma.$transaction).toHaveBeenCalled();
  });

  it('refuses to reuse an account holding an incompatible role (rider)', async () => {
    const { service, tx } = serviceWith({
      reusedUser: { id: 'u1', email: 'jamie@example.com', role: 'rider', passwordHash: 'hash' },
    });

    await expect(service.approveApplication('admin1', 'app1')).rejects.toThrow(ConflictException);
    await expect(service.approveApplication('admin1', 'app1')).rejects.toThrow(/rider account/);
    expect(tx.vendor.create).not.toHaveBeenCalled();
  });

  it('refuses to reuse an account holding an incompatible role (admin)', async () => {
    const { service, tx } = serviceWith({
      reusedUser: { id: 'u1', email: 'jamie@example.com', role: 'admin', passwordHash: 'hash' },
    });

    await expect(service.approveApplication('admin1', 'app1')).rejects.toThrow(ConflictException);
    expect(tx.vendor.create).not.toHaveBeenCalled();
    expect(tx.user.update).not.toHaveBeenCalled();
  });

  it('still promotes a plain consumer account to seller', async () => {
    const { service, tx } = serviceWith({
      reusedUser: { id: 'u1', email: 'jamie@example.com', role: 'consumer', passwordHash: null },
    });

    await service.approveApplication('admin1', 'app1');

    expect(tx.user.update).toHaveBeenCalledWith({ where: { id: 'u1' }, data: { role: 'seller' } });
  });

  it('does not issue a temporary password when the reused account already has one', async () => {
    const { service, tx, auditLog } = serviceWith({
      reusedUser: { id: 'u1', email: 'jamie@example.com', role: 'consumer', passwordHash: 'existing-hash' },
    });
    const issueSpy = jest.spyOn(service, 'issueTemporaryPassword');

    const result = await service.approveApplication('admin1', 'app1');

    expect(issueSpy).not.toHaveBeenCalled();
    expect(result.signIn).toBeUndefined();
    // The account's own credential is untouched — reusing it must never
    // write a new passwordHash or revoke its sessions.
    expect(tx.user.update).toHaveBeenCalledWith({ where: { id: 'u1' }, data: { role: 'seller' } });
    expect(auditLog.log).toHaveBeenCalled();
  });

  it('still issues a temporary password when the reused account has no credential yet', async () => {
    const { service } = serviceWith({
      reusedUser: { id: 'u1', email: 'jamie@example.com', role: 'consumer', passwordHash: null },
    });
    const issueSpy = jest
      .spyOn(service, 'issueTemporaryPassword')
      .mockResolvedValue({ email: 'jamie@example.com', phone: '+919000011199', displayName: 'Candle & Clay', temporaryPassword: 'abcd-efgh-ijkl-mnop' });

    const result = await service.approveApplication('admin1', 'app1');

    expect(issueSpy).toHaveBeenCalledWith('admin1', 'seller1', { audit: false });
    expect(result.signIn?.temporaryPassword).toBe('abcd-efgh-ijkl-mnop');
  });

  it('still issues a temporary password for a brand new account (no existing user)', async () => {
    const { service } = serviceWith({ reusedUser: null });
    const issueSpy = jest
      .spyOn(service, 'issueTemporaryPassword')
      .mockResolvedValue({ email: 'jamie@example.com', phone: '+919000011199', displayName: 'Candle & Clay', temporaryPassword: 'abcd-efgh-ijkl-mnop' });

    const result = await service.approveApplication('admin1', 'app1');

    expect(issueSpy).toHaveBeenCalled();
    expect(result.signIn?.temporaryPassword).toBe('abcd-efgh-ijkl-mnop');
  });
});
