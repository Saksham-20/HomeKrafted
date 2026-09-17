/**
 * A listing's photos are a list, and until 2026-09-17 only one of them
 * could ever be written.
 *
 * `Product.images` has been `ProductImage[]` since M2 and
 * `ProductGallery` has always rendered a main image plus a thumbnail
 * row — but every write path took a single `imagePath` string, deleted
 * every row and created exactly one. Measured on a dev database: 34 of
 * 34 products held exactly one image, so the thumbnail row had never
 * rendered for anybody, and a maker with four photos of a candle had
 * nowhere to put three of them.
 *
 * Two shapes on the wire, one shape in the database:
 *
 * - `imagePaths` — the ordered list the web forms send now. **Index 0 is
 *   the primary**: it is the product card, the OpenGraph image and the
 *   `LocalBusiness` JSON-LD, so its identity matters beyond the gallery.
 * - `imagePath` — the original single field, still accepted. The native
 *   app compiles its own copy of the client and ships on a release cycle
 *   nobody here controls, so narrowing a request value breaks clients
 *   that are already in people's hands (the M22 rule about `category`).
 *   A request carrying both is answered by the list, which is the newer
 *   and more specific statement.
 *
 * Pure, so the rules are testable and the service keeps no copy of them.
 */

/**
 * Six, matching `PhotoUpload`'s own default cap on the web form.
 *
 * Not a taste limit: every accepted upload is re-encoded inline on the
 * request by `image-pipeline.ts` on a 1-vCPU box, and the gallery shows a
 * main image plus four thumbnails, so a seventh photo costs storage and
 * CPU to be seen by nobody.
 */
export const MAX_LISTING_PHOTOS = 6;

export interface ListingPhotoInput {
  imagePath?: string;
  imagePaths?: string[];
}

/**
 * The photo list a write should store, or `undefined` for "the request
 * said nothing about photos, leave the rows alone".
 *
 * An explicitly empty list (`[]`, or `imagePath: ""`) is a real answer —
 * "remove the photos" — and must stay distinguishable from silence, the
 * same way `parseStock` keeps a typed 0 apart from a blank.
 */
export function resolveListingPhotos(dto: ListingPhotoInput): string[] | undefined {
  if (dto.imagePaths !== undefined) return normalisePhotoList(dto.imagePaths);
  if (dto.imagePath !== undefined) return normalisePhotoList([dto.imagePath]);
  return undefined;
}

/**
 * Trimmed, blanks dropped, duplicates dropped (first position wins),
 * capped at `MAX_LISTING_PHOTOS`.
 *
 * Duplicates are dropped rather than refused: the same file dropped
 * twice is a slip, and a wall of errors over it teaches somebody to
 * avoid the form. The cap truncates for the same reason `PhotoUpload`
 * fills the remaining slots instead of rejecting a whole drop.
 */
export function normalisePhotoList(paths: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of paths) {
    const src = typeof raw === 'string' ? raw.trim() : '';
    if (!src || seen.has(src)) continue;
    seen.add(src);
    out.push(src);
    if (out.length === MAX_LISTING_PHOTOS) break;
  }
  return out;
}

/**
 * Is this photo edit material enough to send a live listing back through
 * the M22 review queue?
 *
 * The primary photo is what a buyer sees on the card, so changing it is
 * material. So is adding or removing one — that is new imagery nobody
 * approved. **Reordering the non-primary photos is not**: it changes the
 * order of four already-approved pictures, and re-queueing that would
 * make tidying a gallery something a kitchen learns not to do (M22's
 * "re-queueing everything makes editing something a kitchen avoids").
 */
export function photosChangedMaterially(next: string[], existing: string[]): boolean {
  if (next[0] !== existing[0]) return true;
  if (next.length !== existing.length) return true;
  const existingSet = new Set(existing);
  return next.some((src) => !existingSet.has(src));
}

/** `ProductImage` rows for one listing, in the order given. */
export function photoRowsFor(
  productName: string,
  paths: string[],
): { placeholder: string; src: string; ratio: string; sortOrder: number }[] {
  return paths.map((src, index) => ({
    // `<ImageSlot>`'s label when the file 404s, and the fallback `alt`.
    // Numbered past the first so two thumbnails are not both described
    // as "product photo" to a screen reader.
    placeholder: index === 0 ? `${productName} product photo` : `${productName} photo ${index + 1}`,
    src,
    ratio: '1/1',
    sortOrder: index,
  }));
}
