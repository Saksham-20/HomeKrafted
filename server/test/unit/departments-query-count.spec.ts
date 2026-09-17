import { ProductKind } from '@prisma/client';
import { AttributesService } from '../../src/catalog/attributes.service';

/**
 * `AttributesService.departments()` used to issue three Prisma queries per
 * top-level department (`product.count`, `product.findFirst`,
 * `productCategory.groupBy`) — 3N queries for N departments, on every
 * `/shop` and `/gifts` page load, growing every time an admin adds a
 * department "with no deploy" (CLAUDE.md). The count and the per-category
 * row counts are now each a single batched query across every shelf; only
 * the face-image lookup (a per-department "top-ranked listing" pick) stays
 * one query per department, because collapsing that into a hand-written
 * `DISTINCT ON` would re-implement the `PUBLICLY_LISTED` moderation gate
 * outside `moderation.ts`.
 */

interface CategoryRow {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  icon: string | null;
  imageSrc: string | null;
  sortOrder: number;
  children: CategoryRow[];
}

function shelf(id: string, children: CategoryRow[] = []): CategoryRow {
  return {
    id,
    slug: id,
    name: id,
    description: null,
    icon: null,
    imageSrc: null,
    sortOrder: 0,
    children,
  };
}

function serviceWith(opts: {
  shelves: CategoryRow[];
  categoryCounts: { categoryId: string; _count: { _all: number } }[];
  taggedProducts: { categoryId: string; productId: string }[];
}) {
  const calls = { categoryFindMany: 0, groupBy: 0, taggedFindMany: 0, faceFindFirst: 0 };

  const prisma = {
    category: {
      findMany: jest.fn().mockImplementation(() => {
        calls.categoryFindMany += 1;
        return Promise.resolve(opts.shelves);
      }),
    },
    productCategory: {
      groupBy: jest.fn().mockImplementation(() => {
        calls.groupBy += 1;
        return Promise.resolve(opts.categoryCounts);
      }),
      findMany: jest.fn().mockImplementation(() => {
        calls.taggedFindMany += 1;
        return Promise.resolve(opts.taggedProducts);
      }),
    },
    product: {
      findFirst: jest.fn().mockImplementation(() => {
        calls.faceFindFirst += 1;
        return Promise.resolve(null);
      }),
    },
  };

  const service = new AttributesService(prisma as never);
  return { service, calls };
}

describe('AttributesService.departments query volume', () => {
  it('runs the count and per-category groupBy exactly once regardless of department count', async () => {
    const shelves = [
      shelf('dept-1', [shelf('child-1a'), shelf('child-1b')]),
      shelf('dept-2', [shelf('child-2a')]),
      shelf('dept-3'),
    ];
    const { service, calls } = serviceWith({
      shelves,
      categoryCounts: [
        { categoryId: 'dept-1', _count: { _all: 2 } },
        { categoryId: 'child-1a', _count: { _all: 3 } },
        { categoryId: 'child-1b', _count: { _all: 1 } },
        { categoryId: 'dept-2', _count: { _all: 4 } },
        { categoryId: 'child-2a', _count: { _all: 2 } },
        { categoryId: 'dept-3', _count: { _all: 5 } },
      ],
      taggedProducts: [
        { categoryId: 'dept-1', productId: 'p1' },
        { categoryId: 'child-1a', productId: 'p2' },
        { categoryId: 'dept-2', productId: 'p3' },
        { categoryId: 'dept-3', productId: 'p4' },
      ],
    });

    await service.departments(ProductKind.craft);

    // One query total, not one per shelf — the N+1 fix.
    expect(calls.groupBy).toBe(1);
    expect(calls.taggedFindMany).toBe(1);
    // The face image is still per-department by design (moderation-safety
    // trade-off documented above), so this scales with N …
    expect(calls.faceFindFirst).toBe(shelves.length);
  });

  it('dedupes a product tagged onto more than one shelf under the same department', async () => {
    const shelves = [shelf('dept-1', [shelf('child-1a')])];
    const { service } = serviceWith({
      shelves,
      categoryCounts: [
        { categoryId: 'dept-1', _count: { _all: 1 } },
        { categoryId: 'child-1a', _count: { _all: 1 } },
      ],
      // The same product (p1) tagged both on the department's own shelf
      // and on its child — the department total must count it once.
      taggedProducts: [
        { categoryId: 'dept-1', productId: 'p1' },
        { categoryId: 'child-1a', productId: 'p1' },
      ],
    });

    const result = await service.departments(ProductKind.craft);
    expect(result).toHaveLength(1);
    expect(result[0].count).toBe(1);
  });

  it('computes each department total as the union of its own and its children rows', async () => {
    const shelves = [
      shelf('dept-1', [shelf('child-1a')]),
      shelf('dept-2', [shelf('child-2a')]),
    ];
    const { service } = serviceWith({
      shelves,
      categoryCounts: [
        { categoryId: 'dept-1', _count: { _all: 1 } },
        { categoryId: 'child-1a', _count: { _all: 1 } },
        { categoryId: 'dept-2', _count: { _all: 1 } },
        { categoryId: 'child-2a', _count: { _all: 1 } },
      ],
      taggedProducts: [
        { categoryId: 'dept-1', productId: 'p1' },
        { categoryId: 'child-1a', productId: 'p2' },
        { categoryId: 'dept-2', productId: 'p3' },
        { categoryId: 'child-2a', productId: 'p3' },
      ],
    });

    const result = await service.departments(ProductKind.craft);
    const dept1 = result.find((d) => d.id === 'dept-1')!;
    const dept2 = result.find((d) => d.id === 'dept-2')!;
    expect(dept1.count).toBe(2); // p1 + p2, distinct
    expect(dept2.count).toBe(1); // p3 counted once even though it's tagged twice
  });
});
