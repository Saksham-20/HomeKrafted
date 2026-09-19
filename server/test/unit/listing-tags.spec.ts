import { tagsForCreate, tagsForUpdate } from '../../src/seller/listing-tags';

/**
 * Bestseller / New / Festive / Curated are an admin's call (owner,
 * 2026-09-19). The DTO still accepts `tags` from a seller — a removed
 * field would 400 every client already shipped — so the write is what
 * refuses, by ignoring.
 *
 * Expected values reasoned by hand (docs/TESTS.md).
 */
describe('tagsForCreate', () => {
  it('stores nothing for a seller, whatever the request carried', () => {
    expect(tagsForCreate(['Bestseller', 'Curated'], { actor: 'seller' })).toEqual([]);
  });

  it('treats a missing actor as a seller — the default must stay the safe one', () => {
    expect(tagsForCreate(['Festive'], {})).toEqual([]);
  });

  it('stores what an admin sent', () => {
    expect(tagsForCreate(['Bestseller', 'New'], { actor: 'admin' })).toEqual(['Bestseller', 'New']);
  });

  it('stores an empty list for an admin who sent none', () => {
    expect(tagsForCreate(undefined, { actor: 'admin' })).toEqual([]);
  });
});

describe('tagsForUpdate', () => {
  it('is undefined for a seller, which leaves an admin-set badge exactly as it was', () => {
    // Every seller save posts the form's `tags` back. Writing them would
    // wipe the badge the next time the maker edited a price.
    expect(tagsForUpdate(['Bestseller'], { actor: 'seller' })).toBeUndefined();
    expect(tagsForUpdate([], { actor: 'seller' })).toBeUndefined();
    expect(tagsForUpdate(undefined, {})).toBeUndefined();
  });

  it('passes an admin edit through', () => {
    expect(tagsForUpdate(['Festive'], { actor: 'admin' })).toEqual(['Festive']);
  });

  it('keeps an explicit empty list distinct from silence for an admin', () => {
    // `[]` is "remove the badges"; `undefined` is "this save did not
    // mention them". The parseStock distinction, one column over.
    expect(tagsForUpdate([], { actor: 'admin' })).toEqual([]);
    expect(tagsForUpdate(undefined, { actor: 'admin' })).toBeUndefined();
  });
});
