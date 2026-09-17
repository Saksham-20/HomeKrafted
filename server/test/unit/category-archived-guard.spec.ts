import { BadRequestException } from '@nestjs/common';
import { AdminCategoriesService } from '../../src/admin/categories.service';

/**
 * Neither `merge()`'s target nor `resolveParent()`'s parent was ever
 * checked for `archivedAt`/`mergedIntoId` — finding [19]. An admin could
 * merge a live shelf into a retired one (moving every one of its listings
 * onto a category the browse page and the pickers have already stopped
 * offering), or file a brand-new/moved subcategory under one. Both must
 * now refuse, the same "named, not silent" shape every other guard in
 * this file uses.
 */

interface CategoryRow {
  id: string;
  name: string;
  slug: string;
  group: 'food' | 'craft';
  parentId: string | null;
  archivedAt: Date | null;
  mergedIntoId: string | null;
  children?: CategoryRow[];
}

function row(overrides: Partial<CategoryRow> & { id: string; name: string }): CategoryRow {
  return {
    slug: overrides.id,
    group: 'food',
    parentId: null,
    archivedAt: null,
    mergedIntoId: null,
    children: [],
    ...overrides,
  };
}

function serviceWith(rows: CategoryRow[]) {
  const created: Record<string, unknown>[] = [];
  const txCalls: string[] = [];

  const prisma = {
    category: {
      findUnique: jest.fn().mockImplementation((args: { where: { id: string }; include?: unknown }) => {
        const found = rows.find((r) => r.id === args.where.id);
        return Promise.resolve(found ? { ...found } : null);
      }),
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockImplementation((args: { data: Record<string, unknown> }) => {
        created.push(args.data);
        return Promise.resolve({ id: 'cat-new', ...args.data });
      }),
    },
    $transaction: jest.fn().mockImplementation((fn: (t: unknown) => unknown) => {
      txCalls.push('ran');
      return fn({
        productCategory: { findMany: jest.fn().mockResolvedValue([]), createMany: jest.fn(), deleteMany: jest.fn() },
        product: { updateMany: jest.fn() },
        category: { update: jest.fn().mockResolvedValue({}) },
      });
    }),
  };

  const auditLog = { log: jest.fn().mockResolvedValue(undefined) };
  const service = new AdminCategoriesService(prisma as never, auditLog as never);
  return { service, created, txCalls };
}

describe('AdminCategoriesService.merge — archived/merged target', () => {
  it('refuses to merge into an archived category', async () => {
    const { service, txCalls } = serviceWith([
      row({ id: 'src', name: 'Home Decor', group: 'craft' }),
      row({ id: 'dst', name: 'Retired Shelf', group: 'craft', archivedAt: new Date('2026-01-01') }),
    ]);

    await expect(service.merge('admin-1', 'src', 'dst')).rejects.toBeInstanceOf(BadRequestException);
    expect(txCalls).toHaveLength(0);
  });

  it('refuses to merge into a category that has itself already been merged elsewhere', async () => {
    const { service, txCalls } = serviceWith([
      row({ id: 'src', name: 'Home Decor', group: 'craft' }),
      row({ id: 'dst', name: 'Old Target', group: 'craft', mergedIntoId: 'somewhere-else' }),
    ]);

    await expect(service.merge('admin-1', 'src', 'dst')).rejects.toBeInstanceOf(BadRequestException);
    expect(txCalls).toHaveLength(0);
  });

  it('still merges into a live target', async () => {
    const { service, txCalls } = serviceWith([
      row({ id: 'src', name: 'Home Decor', group: 'craft' }),
      row({ id: 'dst', name: 'Home Décor', group: 'craft' }),
    ]);

    await expect(service.merge('admin-1', 'src', 'dst')).resolves.toMatchObject({ merged: true });
    expect(txCalls).toHaveLength(1);
  });
});

describe('AdminCategoriesService.create — filing under a retired parent', () => {
  it('refuses to create a subcategory under an archived parent', async () => {
    const { service, created } = serviceWith([
      row({ id: 'parent', name: 'Retired Parent', group: 'food', archivedAt: new Date('2026-01-01') }),
    ]);

    await expect(
      service.create('admin-1', { name: 'New Child', group: 'food', parentId: 'parent' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(created).toHaveLength(0);
  });

  it('refuses to create a subcategory under a merged-away parent', async () => {
    const { service, created } = serviceWith([
      row({ id: 'parent', name: 'Merged Parent', group: 'food', mergedIntoId: 'elsewhere' }),
    ]);

    await expect(
      service.create('admin-1', { name: 'New Child', group: 'food', parentId: 'parent' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(created).toHaveLength(0);
  });

  it('still creates a subcategory under a live parent', async () => {
    const { service, created } = serviceWith([row({ id: 'parent', name: 'Live Parent', group: 'food' })]);

    await service.create('admin-1', { name: 'New Child', group: 'food', parentId: 'parent' });
    expect(created).toHaveLength(1);
  });
});
