import { SellerMenuService } from '../../src/seller/menu.service';

/**
 * A snack menu-item edit re-queues the listing for moderation only when
 * something material actually changed — name, description or the photo
 * (`requeueOnEdit` in `catalog/moderation.ts`). `imagePath` used to
 * re-queue whenever the field was merely *present* on the request rather
 * than compared against the stored `imageSrc`, so an ordinary
 * price/category/availability edit — which resends the current photo
 * path along with everything else — silently pulled a live snack off the
 * buyer-facing menu. `meal-plans.service.ts#update`'s `imageSrc` check
 * does the comparison correctly; this pins the same shape here.
 */

function serviceWith(existing: Record<string, unknown>) {
  const updateArgs: { data?: Record<string, unknown> } = {};
  const prisma = {
    snack: {
      findUnique: jest.fn().mockResolvedValue(existing),
      update: jest.fn().mockImplementation((args: { data: Record<string, unknown> }) => {
        updateArgs.data = args.data;
        return Promise.resolve({ ...existing, ...args.data });
      }),
    },
  };
  const service = new SellerMenuService(prisma as never);
  return { service, updateArgs };
}

const BASE = {
  id: 'sn1',
  sellerId: 'se1',
  name: 'Mathri',
  description: 'Crisp and salty.',
  price: 120,
  category: 'savoury',
  diet: 'veg',
  imageSrc: '/uploads/mathri.webp',
  available: true,
  moderationStatus: 'active',
};

describe('SellerMenuService#update — imagePath requeue', () => {
  it('does not requeue when the same imagePath is resent alongside an ordinary edit', async () => {
    const { service, updateArgs } = serviceWith(BASE);
    await service.update('se1', 'sn1', { price: 150, imagePath: BASE.imageSrc } as never);
    expect(updateArgs.data?.moderationStatus).toBeUndefined();
  });

  it('does not requeue when imagePath is omitted from the request', async () => {
    const { service, updateArgs } = serviceWith(BASE);
    await service.update('se1', 'sn1', { available: false } as never);
    expect(updateArgs.data?.moderationStatus).toBeUndefined();
  });

  it('requeues when the photo actually changes', async () => {
    const { service, updateArgs } = serviceWith(BASE);
    await service.update('se1', 'sn1', { imagePath: '/uploads/new-mathri.webp' } as never);
    expect(updateArgs.data?.moderationStatus).toBe('pending');
  });

  it('still requeues on a name change, independent of the photo', async () => {
    const { service, updateArgs } = serviceWith(BASE);
    await service.update('se1', 'sn1', { name: 'Namkeen Mathri', imagePath: BASE.imageSrc } as never);
    expect(updateArgs.data?.moderationStatus).toBe('pending');
  });
});
