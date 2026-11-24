import { SellerListingsService } from '../../src/seller/listings.service';

/**
 * A derived SKU that is already taken is suffixed, not refused.
 *
 * The client derives `sku` from name + size, and the column is unique
 * platform-wide, so a second maker listing "Lemon pickle · One" — or a
 * Duplicate kept under the same name — used to fail with
 * `SKU "lemon-pickle-one" is already in use`.
 */
function serviceWith(rows: { sku: string; productId: string }[]) {
  const prisma = {
    weightOption: {
      findMany: jest.fn(({ where }: { where: { sku: { in: string[] } } }) =>
        Promise.resolve(rows.filter((r) => where.sku.in.includes(r.sku))),
      ),
      findUnique: jest.fn(({ where }: { where: { sku: string } }) =>
        Promise.resolve(rows.find((r) => r.sku === where.sku) ?? null),
      ),
    },
  };
  const service = new SellerListingsService(prisma as never, {} as never, {} as never);
  return (dto: { weightOptions: { sku: string }[]; defaultWeightSku: string }, productId?: string) =>
    (service as unknown as {
      resolveSkuClashes(d: typeof dto, p?: string): Promise<void>;
    }).resolveSkuClashes(dto, productId);
}

describe('SellerListingsService SKU clashes', () => {
  it('suffixes a SKU another listing owns and moves the default with it', async () => {
    const resolve = serviceWith([{ sku: 'lemon-pickle-one', productId: 'other' }]);
    const dto = { weightOptions: [{ sku: 'lemon-pickle-one' }], defaultWeightSku: 'lemon-pickle-one' };
    await resolve(dto);
    expect(dto.weightOptions[0].sku).toMatch(/^lemon-pickle-one-[a-z0-9]+$/);
    expect(dto.defaultWeightSku).toBe(dto.weightOptions[0].sku);
  });

  it('leaves the SKUs this listing already owns alone on an edit', async () => {
    const resolve = serviceWith([{ sku: 'lemon-pickle-one', productId: 'mine' }]);
    const dto = { weightOptions: [{ sku: 'lemon-pickle-one' }], defaultWeightSku: 'lemon-pickle-one' };
    await resolve(dto, 'mine');
    expect(dto.weightOptions[0].sku).toBe('lemon-pickle-one');
  });

  it('separates two rows of one request that derived the same SKU, keeping the default on the first', async () => {
    const resolve = serviceWith([]);
    const dto = { weightOptions: [{ sku: 'jar-one' }, { sku: 'jar-one' }], defaultWeightSku: 'jar-one' };
    await resolve(dto);
    expect(dto.weightOptions[0].sku).toBe('jar-one');
    expect(dto.weightOptions[1].sku).not.toBe('jar-one');
    expect(dto.defaultWeightSku).toBe('jar-one');
  });

  it('keeps a suffixed SKU within the 80-character limit', async () => {
    const long = 'x'.repeat(80);
    const resolve = serviceWith([{ sku: long, productId: 'other' }]);
    const dto = { weightOptions: [{ sku: long }], defaultWeightSku: long };
    await resolve(dto);
    expect(dto.weightOptions[0].sku.length).toBeLessThanOrEqual(80);
  });
});
