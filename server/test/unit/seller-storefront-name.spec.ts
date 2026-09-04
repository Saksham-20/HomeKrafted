import { SellerService } from '../../src/seller/seller.service';

/**
 * Renaming a storefront (M60).
 *
 * A kitchen registered under the owner's own name and later wants to be
 * "Pihu's Kitchen". Three things about that are invisible on the happy
 * path and each is the kind of thing a later refactor removes:
 *
 * 1. `Seller.displayName` moves with `Vendor.name`. They are the same
 *    fact read by different screens; left apart, the admin queue starts
 *    naming a kitchen something no buyer has ever seen.
 * 2. The `slug` is untouched. It is in every storefront URL anybody has
 *    shared and everything Google has indexed (the M58 category rule).
 * 3. Two kitchens may share a name — accounts are told apart by phone and
 *    email, which are unique. Nothing here may grow a uniqueness check.
 *
 * The shape check is the same `checkBusinessName` `/sell` applies, so a
 * rename cannot land the autofilled email address the application form
 * would have refused.
 */

function serviceWith() {
  const captured: { vendor?: Record<string, unknown>; seller?: Record<string, unknown> } = {};
  const tx = {
    vendor: {
      update: jest.fn().mockImplementation((args: { data: Record<string, unknown> }) => {
        captured.vendor = args.data;
        // Enough of a row for `mapVendor` to render the reply.
        return Promise.resolve({
          id: 'v1',
          slug: 'pihus-kitchen',
          lat: 30.7,
          lng: 76.7,
          joinedAt: new Date('2026-01-01T00:00:00Z'),
        });
      }),
    },
    seller: {
      updateMany: jest.fn().mockImplementation((args: { data: Record<string, unknown> }) => {
        captured.seller = args.data;
        return Promise.resolve({ count: 1 });
      }),
    },
  };
  const prisma = {
    vendor: { findUnique: jest.fn().mockResolvedValue({ id: 'v1', slug: 'pihus-kitchen' }) },
    $transaction: jest.fn().mockImplementation((fn: (t: unknown) => unknown) => fn(tx)),
  };
  const service = new SellerService(prisma as never, {} as never);
  return { service, captured, tx };
}

describe('renaming a storefront', () => {
  it('writes the name to the vendor and the seller together, and never the slug', async () => {
    const { service, captured, tx } = serviceWith();
    await service.updateStorefront('v1', { name: "Pihu's Kitchen" });

    expect(captured.vendor?.name).toBe("Pihu's Kitchen");
    expect(captured.seller?.displayName).toBe("Pihu's Kitchen");
    expect(captured.vendor).not.toHaveProperty('slug');
    expect(tx.seller.updateMany).toHaveBeenCalledTimes(1);
  });

  it('allows a name another kitchen already uses', async () => {
    const { service, captured } = serviceWith();
    await service.updateStorefront('v1', { name: 'Home Bakes' });
    expect(captured.vendor?.name).toBe('Home Bakes');
  });

  it('refuses a name that is really an email address, with a sentence', async () => {
    const { service } = serviceWith();
    await expect(service.updateStorefront('v1', { name: 'someone@example.com' })).rejects.toThrow(
      /email address/i,
    );
  });

  it('leaves the seller row alone when the rename is not part of the edit', async () => {
    const { service, tx, captured } = serviceWith();
    await service.updateStorefront('v1', { bio: 'Small batch pickles.' });
    expect(tx.seller.updateMany).not.toHaveBeenCalled();
    expect(captured.vendor?.name).toBeUndefined();
  });
});
