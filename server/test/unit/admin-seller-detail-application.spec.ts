import { AdminSellersService } from '../../src/admin/sellers.service';

/**
 * `getSellerDetail`'s "application" section is documented as "what they
 * were approved on" — but it was picked by `orderBy: createdAt desc` with
 * no status filter, so an applicant who re-applies with the same email
 * *after* being approved (the duplicate-application case M32 pinned in
 * `duplicate-applications.e2e-spec.ts`) leaves a second, undecided row
 * that is newer than the one actually approved. That row — not the
 * approval — was what the admin screen showed.
 *
 * Fixed by preferring the `status: 'approved'` row, falling back to the
 * newest row of any status only when none was ever approved (a
 * hand-created kitchen, or a pre-approval legacy row).
 */

function seller(overrides: Record<string, unknown> = {}) {
  return {
    id: 'seller1',
    vendorId: 'vend1',
    userId: 'u1',
    specialties: ['crafts'],
    displayName: 'Candle & Clay',
    status: 'approved',
    createdAt: new Date('2026-08-01T00:00:00Z'),
    rating: null,
    reviewCount: null,
    vendor: {
      id: 'vend1',
      name: 'Candle & Clay',
      slug: 'candle-clay',
      type: 'maker',
      bio: null,
      location: 'Sector 34, Chandigarh',
      area: 'chd-sector-34',
      deliveryRadiusKm: 5,
      rating: null,
      reviewCount: 0,
    },
    user: {
      id: 'u1',
      name: 'Jamie Kaur',
      email: 'jamie@example.com',
      phone: '+919000011199',
      emailVerified: true,
      phoneVerified: true,
      suspended: false,
      authProviders: ['email'],
      createdAt: new Date('2026-08-01T00:00:00Z'),
      passwordHash: 'hash',
      mustChangePassword: false,
      tempPasswordIssuedAt: null,
      credentialsClaimedAt: new Date('2026-08-01T00:00:00Z'),
    },
    ...overrides,
  };
}

function zeroAggregate() {
  return { _sum: {}, _count: { _all: 0 } };
}

function serviceWith(sellerRow: Record<string, unknown>, applicationFindFirst: jest.Mock) {
  const prisma = {
    seller: { findUnique: jest.fn().mockResolvedValue(sellerRow) },
    product: { count: jest.fn().mockResolvedValue(0) },
    snack: { count: jest.fn().mockResolvedValue(0) },
    mealPlan: { count: jest.fn().mockResolvedValue(0) },
    order: {
      count: jest.fn().mockResolvedValue(0),
      findFirst: jest.fn().mockResolvedValue(null),
    },
    orderItem: { aggregate: jest.fn().mockResolvedValue(zeroAggregate()) },
    snackOrder: { aggregate: jest.fn().mockResolvedValue(zeroAggregate()) },
    payout: { aggregate: jest.fn().mockResolvedValue(zeroAggregate()) },
    review: { count: jest.fn().mockResolvedValue(0) },
    vendorFollow: { count: jest.fn().mockResolvedValue(0) },
    $queryRaw: jest.fn().mockResolvedValue([{ revenue: 0 }]),
    sellerApplication: { findFirst: applicationFindFirst },
  };

  const service = new AdminSellersService(
    prisma as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  );

  return { service, prisma };
}

describe('AdminSellersService#getSellerDetail — application section', () => {
  it('prefers the approved application over a newer, undecided re-application', async () => {
    const approved = { id: 'app-approved', status: 'approved', email: 'jamie@example.com', createdAt: new Date('2026-08-01') };
    const findFirst = jest.fn().mockImplementation(({ where }: { where: { status?: string } }) =>
      Promise.resolve(where.status === 'approved' ? approved : null),
    );
    const { service } = serviceWith(seller(), findFirst);

    const detail = await service.getSellerDetail('seller1');

    expect(detail.application?.id).toBe('app-approved');
    // The first call must ask for the approved row specifically — a plain
    // "most recent" query is exactly the bug being fixed.
    expect(findFirst).toHaveBeenNthCalledWith(1, {
      where: { email: 'jamie@example.com', status: 'approved' },
      orderBy: { createdAt: 'desc' },
    });
  });

  it('falls back to the newest application when none was ever approved', async () => {
    const legacy = { id: 'app-legacy', status: 'new', email: 'jamie@example.com', createdAt: new Date('2026-07-01') };
    const findFirst = jest.fn().mockImplementation(({ where }: { where: { status?: string } }) =>
      Promise.resolve(where.status === 'approved' ? null : legacy),
    );
    const { service } = serviceWith(seller(), findFirst);

    const detail = await service.getSellerDetail('seller1');

    expect(detail.application?.id).toBe('app-legacy');
    expect(findFirst).toHaveBeenCalledTimes(2);
  });

  it('is undefined when the seller has no email at all', async () => {
    const findFirst = jest.fn();
    const { service } = serviceWith(seller({ user: { ...seller().user, email: null } }), findFirst);

    const detail = await service.getSellerDetail('seller1');

    expect(detail.application).toBeUndefined();
    expect(findFirst).not.toHaveBeenCalled();
  });
});
