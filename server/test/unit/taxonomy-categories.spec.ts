import { TaxonomyService } from '../../src/catalog/taxonomy.service';

/**
 * Retired shelves and the read side of a merge (G1).
 *
 * Two bugs, one file: `listCategories()` ran with no `where` clause at
 * all, so an archived or merged category kept appearing in every picker
 * and browse page fed by `GET /categories` — the exact thing
 * `AttributesService.departments()` already guards against for the buyer
 * browse page. And `mapCategory()` dropped `archivedAt`/`mergedIntoId`
 * entirely, so even a caller that filtered client-side had no field to
 * filter on, and the documented "a merged slug resolves to its target"
 * behaviour had nothing to read.
 */

interface CategoryRow {
  id: string;
  slug: string;
  name: string;
  imagePlaceholder: string;
  imageSrc: string | null;
  productCount: number;
  sortOrder: number;
  archivedAt: Date | null;
  mergedIntoId: string | null;
}

function baseRow(overrides: Partial<CategoryRow>): CategoryRow {
  return {
    id: 'ct1',
    slug: 'pickles',
    name: 'Pickles',
    imagePlaceholder: 'placeholder',
    imageSrc: null,
    productCount: 0,
    sortOrder: 0,
    archivedAt: null,
    mergedIntoId: null,
    ...overrides,
  };
}

function serviceWith(rows: CategoryRow[]) {
  const findManyCalls: unknown[] = [];
  const prisma = {
    category: {
      findMany: jest.fn().mockImplementation((args: { where?: Record<string, unknown> }) => {
        findManyCalls.push(args?.where);
        const where = args?.where ?? {};
        const filtered = rows.filter((row) => {
          if ('archivedAt' in where && where.archivedAt === null && row.archivedAt !== null) return false;
          if ('mergedIntoId' in where && where.mergedIntoId === null && row.mergedIntoId !== null) return false;
          return true;
        });
        return Promise.resolve(filtered);
      }),
      findUnique: jest.fn().mockImplementation((args: { where: { slug?: string; id?: string } }) =>
        Promise.resolve(
          rows.find((row) =>
            args.where.slug !== undefined ? row.slug === args.where.slug : row.id === args.where.id,
          ) ?? null,
        ),
      ),
    },
    occasion: { findMany: jest.fn(), findUnique: jest.fn() },
    collection: { findMany: jest.fn(), findUnique: jest.fn() },
    hamperBox: { findMany: jest.fn() },
  };
  const service = new TaxonomyService(prisma as never);
  return { service, prisma, findManyCalls };
}

describe('TaxonomyService.listCategories', () => {
  it('excludes an archived category', async () => {
    const { service } = serviceWith([
      baseRow({ id: 'ct1', slug: 'pickles' }),
      baseRow({ id: 'ct2', slug: 'diyas', archivedAt: new Date('2026-09-01') }),
    ]);
    const result = await service.listCategories();
    expect(result.map((c) => c.id)).toEqual(['ct1']);
  });

  it('excludes a merged category', async () => {
    const { service } = serviceWith([
      baseRow({ id: 'ct1', slug: 'home-decor' }),
      baseRow({ id: 'ct2', slug: 'home-decor-2', mergedIntoId: 'ct1' }),
    ]);
    const result = await service.listCategories();
    expect(result.map((c) => c.id)).toEqual(['ct1']);
  });

  it('filters at the database with an explicit where clause, not by reading everything back', async () => {
    const { service, findManyCalls } = serviceWith([baseRow({})]);
    await service.listCategories();
    expect(findManyCalls[0]).toMatchObject({ archivedAt: null, mergedIntoId: null });
  });

  it('getCategory(slug) stays unfiltered, so an old shared link to an archived shelf still resolves', async () => {
    const { service } = serviceWith([
      baseRow({ id: 'ct2', slug: 'diyas', archivedAt: new Date('2026-09-01') }),
    ]);
    const result = await service.getCategory('diyas');
    expect(result.id).toBe('ct2');
  });
});

describe('TaxonomyService.getCategoryById', () => {
  it('stays unfiltered, so a product still filed under an archived category keeps its breadcrumb', async () => {
    const { service } = serviceWith([
      baseRow({ id: 'ct2', slug: 'diyas', name: 'Diyas', archivedAt: new Date('2026-09-01') }),
    ]);
    const result = await service.getCategoryById('ct2');
    expect(result.id).toBe('ct2');
    expect(result.name).toBe('Diyas');
  });

  it('also resolves a merged category, same as a slug link would', async () => {
    const { service } = serviceWith([
      baseRow({ id: 'ct1', slug: 'home-decor' }),
      baseRow({ id: 'ct2', slug: 'home-decor-2', mergedIntoId: 'ct1' }),
    ]);
    const result = await service.getCategoryById('ct2');
    expect(result.id).toBe('ct2');
    expect(result.mergedIntoId).toBe('ct1');
  });

  it('throws NotFoundException for an id that matches nothing', async () => {
    const { service } = serviceWith([baseRow({ id: 'ct1' })]);
    await expect(service.getCategoryById('nope')).rejects.toThrow('Category not found');
  });

  it('does not appear via listCategories once archived, even though it still resolves by id', async () => {
    const { service } = serviceWith([
      baseRow({ id: 'ct1', slug: 'pickles' }),
      baseRow({ id: 'ct2', slug: 'diyas', archivedAt: new Date('2026-09-01') }),
    ]);
    const listed = await service.listCategories();
    expect(listed.map((c) => c.id)).not.toContain('ct2');
    const byId = await service.getCategoryById('ct2');
    expect(byId.id).toBe('ct2');
  });
});

describe('mapCategory via TaxonomyService', () => {
  it('carries archivedAt and mergedIntoId through to the payload', async () => {
    const mergedAt = new Date('2026-09-10T00:00:00.000Z');
    const { service } = serviceWith([
      baseRow({ id: 'ct2', slug: 'home-decor-2', archivedAt: mergedAt, mergedIntoId: 'ct1' }),
    ]);
    const result = await service.getCategory('home-decor-2');
    expect(result.archivedAt).toBe(mergedAt.toISOString());
    expect(result.mergedIntoId).toBe('ct1');
  });

  it('reads null, not undefined, for a live top-level shelf', async () => {
    const { service } = serviceWith([baseRow({ id: 'ct1', slug: 'pickles' })]);
    const result = await service.getCategory('pickles');
    expect(result.archivedAt).toBeNull();
    expect(result.mergedIntoId).toBeNull();
  });
});
