import { ConflictException } from '@nestjs/common';
import { AdminCollectionsService } from '../../src/admin/collections.service';

/**
 * Creating a collection whose (admin-suppliable) `slug` collides with an
 * existing one — finding [18].
 *
 * `create()` used to treat a slug collision as "this is really an edit"
 * and silently redirected into `update(existingBySlug.id, dto)`, so a
 * second admin (or a native client) sending a colliding slug on what they
 * believe is a brand-new collection instead overwrote an unrelated
 * collection's title, description and product membership. Every other
 * named vocabulary in this file (occasions) refuses a duplicate with a
 * 409 naming the existing row rather than quietly acting on it behalf —
 * `create` must do the same.
 */

interface CollectionRow {
  id: string;
  slug: string;
  title: string;
}

function serviceWith(existing: CollectionRow[]) {
  const transactions: string[] = [];
  const updateSpy = jest.fn();

  const tx = {
    collection: {
      update: jest.fn().mockImplementation((args: { data: Record<string, unknown> }) => {
        updateSpy(args.data);
        return Promise.resolve({ id: existing[0]?.id ?? 'col-x' });
      }),
      create: jest.fn().mockImplementation((args: { data: Record<string, unknown> }) => {
        return Promise.resolve({ id: 'col-new', ...args.data });
      }),
      findUniqueOrThrow: jest.fn().mockImplementation((args: { where: { id: string } }) =>
        Promise.resolve({
          id: args.where.id,
          slug: 'new-slug',
          title: 'New title',
          description: null,
          occasionId: null,
          imageSrc: null,
          featured: false,
          sortOrder: 0,
          products: [],
        }),
      ),
    },
    collectionProduct: {
      createMany: jest.fn().mockResolvedValue(undefined),
      deleteMany: jest.fn().mockResolvedValue(undefined),
    },
  };

  const prisma = {
    product: { count: jest.fn().mockResolvedValue(0) },
    occasion: { findUnique: jest.fn().mockResolvedValue(null) },
    collection: {
      findUnique: jest.fn().mockImplementation((args: { where: { slug?: string; id?: string } }) =>
        Promise.resolve(
          existing.find(
            (c) => (args.where.slug !== undefined && c.slug === args.where.slug) || (args.where.id !== undefined && c.id === args.where.id),
          ) ?? null,
        ),
      ),
    },
    $transaction: jest.fn().mockImplementation((fn: (t: typeof tx) => unknown) => {
      transactions.push('ran');
      return fn(tx);
    }),
  };

  const auditLog = { log: jest.fn().mockResolvedValue(undefined) };
  const service = new AdminCollectionsService(prisma as never, auditLog as never);
  return { service, updateSpy, transactions };
}

describe('AdminCollectionsService.create — slug collision', () => {
  it('refuses with a 409 rather than silently editing the existing collection', async () => {
    const { service, updateSpy } = serviceWith([{ id: 'col-1', slug: 'diwali-picks', title: 'Diwali Picks' }]);

    await expect(
      service.create('admin-1', {
        title: 'A completely different collection',
        slug: 'diwali-picks',
        productIds: [],
      } as never),
    ).rejects.toBeInstanceOf(ConflictException);

    // The existing collection was never touched.
    expect(updateSpy).not.toHaveBeenCalled();
  });

  it('names the existing collection in the refusal', async () => {
    const { service } = serviceWith([{ id: 'col-1', slug: 'diwali-picks', title: 'Diwali Picks' }]);

    await expect(
      service.create('admin-1', { title: 'New title', slug: 'diwali-picks', productIds: [] } as never),
    ).rejects.toThrow(/Diwali Picks/);
  });

  it('still creates normally when the slug is free', async () => {
    const { service, transactions } = serviceWith([]);

    const result = await service.create('admin-1', {
      title: 'New title',
      slug: 'new-slug',
      productIds: [],
    } as never);

    expect(transactions).toHaveLength(1);
    expect(result.slug).toBe('new-slug');
  });
});
