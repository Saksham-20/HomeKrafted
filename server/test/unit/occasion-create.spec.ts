import { ConflictException } from '@nestjs/common';
import { AdminCollectionsService } from '../../src/admin/collections.service';

/**
 * Adding an occasion (M43).
 *
 * The interesting behaviour is all in the refusals and the derivations,
 * none of which are visible on the happy path:
 *
 * - a same-name occasion is **refused**, not quietly de-duplicated. Handing
 *   back the existing row would make the admin believe the date and
 *   tagline they typed had been saved onto it.
 * - `initial` is derived, because it is always the first letter and a
 *   field for it is a field somebody fills in wrong.
 * - no date means **evergreen**, an answer rather than an omission — a
 *   birthday has no season.
 * - the slug is made unique by the service, because two festivals can
 *   share a name once punctuation is stripped.
 */

interface OccasionRow {
  id: string;
  slug: string;
  name: string;
  initial: string;
  celebratedOn: Date | null;
  tagline: string | null;
  imageSrc: string | null;
}

function serviceWith(existing: Partial<OccasionRow>[]) {
  const created: Record<string, unknown>[] = [];
  const audited: Record<string, unknown>[] = [];

  const prisma = {
    occasion: {
      findFirst: jest.fn().mockImplementation((args: { where: { name: { equals: string } } }) => {
        const wanted = args.where.name.equals.toLowerCase();
        return Promise.resolve(
          existing.find((o) => (o.name ?? '').toLowerCase() === wanted) ?? null,
        );
      }),
      findUnique: jest.fn().mockImplementation((args: { where: { slug?: string } }) =>
        Promise.resolve(existing.find((o) => o.slug === args.where.slug) ?? null),
      ),
      create: jest.fn().mockImplementation((args: { data: Record<string, unknown> }) => {
        created.push(args.data);
        return Promise.resolve({ id: 'oc-new', ...args.data });
      }),
    },
  };

  const auditLog = {
    log: jest.fn().mockImplementation((entry: Record<string, unknown>) => {
      audited.push(entry);
      return Promise.resolve(undefined);
    }),
  };

  const service = new AdminCollectionsService(prisma as never, auditLog as never);
  return { service, created, audited };
}

describe('AdminCollectionsService.createOccasion', () => {
  it('derives the slug and the ring letter from the name', async () => {
    const { service, created } = serviceWith([]);
    await service.createOccasion('admin-1', { name: 'Raksha Bandhan' });
    expect(created[0]).toMatchObject({ slug: 'raksha-bandhan', initial: 'R', name: 'Raksha Bandhan' });
  });

  it('collapses runs of whitespace rather than storing them', async () => {
    const { service, created } = serviceWith([]);
    await service.createOccasion('admin-1', { name: '  Karwa   Chauth ' });
    expect(created[0].name).toBe('Karwa Chauth');
  });

  it('rings the first letter, not the first character', async () => {
    const { service, created } = serviceWith([]);
    await service.createOccasion('admin-1', { name: "'Tis the season" });
    expect(created[0].initial).toBe('T');
  });

  it('refuses a name that already exists, whatever the case', async () => {
    const { service, created } = serviceWith([{ name: 'Diwali', slug: 'diwali' }]);
    await expect(service.createOccasion('admin-1', { name: 'diwali' })).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(created).toHaveLength(0);
  });

  it('names the existing occasion in the refusal, so the admin knows what to pick', async () => {
    const { service } = serviceWith([{ name: 'Diwali', slug: 'diwali' }]);
    await expect(service.createOccasion('admin-1', { name: 'DIWALI' })).rejects.toThrow(/Diwali/);
  });

  it('walks the slug when one is taken by a different name', async () => {
    const { service, created } = serviceWith([{ name: 'Eid al-Fitr', slug: 'eid-al-fitr' }]);
    await service.createOccasion('admin-1', { name: 'Eid al Fitr' });
    expect(created[0].slug).toBe('eid-al-fitr-2');
  });

  it('stores no date as evergreen rather than as today', async () => {
    const { service, created } = serviceWith([]);
    await service.createOccasion('admin-1', { name: 'Birthdays' });
    expect(created[0].celebratedOn).toBeNull();
  });

  it('keeps a date that was given', async () => {
    const { service, created } = serviceWith([]);
    await service.createOccasion('admin-1', {
      name: 'Onam',
      celebratedOn: '2026-09-14T00:00:00.000Z',
    });
    expect((created[0].celebratedOn as Date).toISOString()).toBe('2026-09-14T00:00:00.000Z');
  });

  it('stores blank optional text as null, not as an empty string', async () => {
    const { service, created } = serviceWith([]);
    await service.createOccasion('admin-1', { name: 'Lohri', tagline: '   ', imageSrc: '' });
    expect(created[0].tagline).toBeNull();
    expect(created[0].imageSrc).toBeNull();
  });

  it('audits the creation with the actor and the name', async () => {
    const { service, audited } = serviceWith([]);
    await service.createOccasion('admin-7', { name: 'Pongal' });
    expect(audited[0]).toMatchObject({
      actorId: 'admin-7',
      action: 'occasion.create',
      targetType: 'Occasion',
    });
    expect((audited[0].metadata as { name: string }).name).toBe('Pongal');
  });
});
