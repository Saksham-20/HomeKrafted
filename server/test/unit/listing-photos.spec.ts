import {
  MAX_LISTING_PHOTOS,
  normalisePhotoList,
  photoRowsFor,
  photosChangedMaterially,
  resolveListingPhotos,
} from '../../src/seller/listing-photos';

/**
 * Regression: ISSUE-003 — a listing could only ever hold one photo
 * Found by /qa on 2026-09-17
 * Report: .gstack/qa-reports/qa-report-localhost-2026-09-17.md
 *
 * `Product.images` has been a list since M2 and `ProductGallery` has
 * always drawn a thumbnail row, but every write path deleted every row
 * and created exactly one. Measured: 34 of 34 products on a dev database
 * held exactly one image, so the thumbnail row had never rendered.
 *
 * Expected values reasoned by hand (docs/TESTS.md), never recorded.
 */
describe('resolveListingPhotos', () => {
  it('returns undefined when the request says nothing about photos, so rows are left alone', () => {
    expect(resolveListingPhotos({})).toBeUndefined();
    expect(resolveListingPhotos({ name: 'ignored' } as never)).toBeUndefined();
  });

  it('reads the list when one is sent', () => {
    expect(resolveListingPhotos({ imagePaths: ['/uploads/a.webp', '/uploads/b.webp'] })).toEqual([
      '/uploads/a.webp',
      '/uploads/b.webp',
    ]);
  });

  it('still accepts the original single field, so a native client keeps working', () => {
    expect(resolveListingPhotos({ imagePath: '/uploads/a.webp' })).toEqual(['/uploads/a.webp']);
  });

  it('lets the list win when a request carries both — the newer, more specific statement', () => {
    expect(
      resolveListingPhotos({ imagePath: '/uploads/old.webp', imagePaths: ['/uploads/new.webp'] }),
    ).toEqual(['/uploads/new.webp']);
  });

  it('treats an explicitly empty answer as "remove the photos", not as silence', () => {
    // The distinction `parseStock` exists to keep: a typed zero is an
    // answer, a blank is not.
    expect(resolveListingPhotos({ imagePaths: [] })).toEqual([]);
    expect(resolveListingPhotos({ imagePath: '' })).toEqual([]);
    expect(resolveListingPhotos({})).toBeUndefined();
  });
});

describe('normalisePhotoList', () => {
  it('trims, and drops blanks rather than storing an empty src', () => {
    expect(normalisePhotoList([' /uploads/a.webp ', '', '   ', '/uploads/b.webp'])).toEqual([
      '/uploads/a.webp',
      '/uploads/b.webp',
    ]);
  });

  it('drops a duplicate and keeps its first position', () => {
    expect(
      normalisePhotoList(['/uploads/a.webp', '/uploads/b.webp', '/uploads/a.webp']),
    ).toEqual(['/uploads/a.webp', '/uploads/b.webp']);
  });

  it('truncates at the cap instead of refusing the whole batch', () => {
    const many = Array.from({ length: 9 }, (_, i) => `/uploads/${i}.webp`);
    const out = normalisePhotoList(many);
    expect(out).toHaveLength(MAX_LISTING_PHOTOS);
    expect(out[0]).toBe('/uploads/0.webp');
    expect(out[MAX_LISTING_PHOTOS - 1]).toBe(`/uploads/${MAX_LISTING_PHOTOS - 1}.webp`);
  });
});

describe('photosChangedMaterially', () => {
  const a = '/uploads/a.webp';
  const b = '/uploads/b.webp';
  const c = '/uploads/c.webp';

  it('is false when the same photos are posted back — editing a price must not re-queue', () => {
    expect(photosChangedMaterially([a, b], [a, b])).toBe(false);
  });

  it('is true when the primary changes, because that is the product card', () => {
    expect(photosChangedMaterially([b, a], [a, b])).toBe(true);
  });

  it('is true when a photo is added or removed — imagery nobody approved', () => {
    expect(photosChangedMaterially([a, b, c], [a, b])).toBe(true);
    expect(photosChangedMaterially([a], [a, b])).toBe(true);
  });

  it('is false for a reorder below the primary, so tidying a gallery is free', () => {
    // M22: re-queueing everything makes editing something a kitchen
    // learns to avoid. These three pictures are already approved.
    expect(photosChangedMaterially([a, c, b], [a, b, c])).toBe(false);
  });

  it('is true when a photo is swapped for a different one at the same position', () => {
    expect(photosChangedMaterially([a, c], [a, b])).toBe(true);
  });

  it('handles the no-photo cases without calling them a change', () => {
    expect(photosChangedMaterially([], [])).toBe(false);
    expect(photosChangedMaterially([a], [])).toBe(true);
    expect(photosChangedMaterially([], [a])).toBe(true);
  });
});

describe('photoRowsFor', () => {
  it('numbers the rows so sortOrder decides the primary', () => {
    const rows = photoRowsFor('Sandalwood Soy Candle', ['/uploads/a.webp', '/uploads/b.webp']);
    expect(rows.map((r) => r.sortOrder)).toEqual([0, 1]);
    expect(rows[0].src).toBe('/uploads/a.webp');
  });

  it('describes the second photo distinctly, so two thumbnails are not one label', () => {
    const rows = photoRowsFor('Brass Diya Set', ['/uploads/a.webp', '/uploads/b.webp']);
    expect(rows[0].placeholder).toBe('Brass Diya Set product photo');
    expect(rows[1].placeholder).toBe('Brass Diya Set photo 2');
  });

  it('creates no rows for no photos', () => {
    expect(photoRowsFor('Anything', [])).toEqual([]);
  });
});
