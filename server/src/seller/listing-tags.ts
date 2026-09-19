import type { ProductTag } from '@prisma/client';
import type { ListingWriteOptions } from './listings.service';

/**
 * `Product.tags` — Bestseller, New, Festive, Curated — are merchandising,
 * and only an admin sets them (owner, 2026-09-19).
 *
 * A badge on a card is the platform vouching for a listing. When the
 * maker could tick "Bestseller" on their own work the badge said nothing
 * the listing's own title did not, and every buyer-side "Bestseller"
 * filter was counting self-promotion. So the write is decided by **who is
 * writing**, here, and nowhere else — both `create` and `update` in
 * `SellerListingsService` ask these two functions and keep no copy of the
 * rule.
 *
 * **Ignored, never refused.** `tags` is still on `CreateListingDto` and
 * still accepted from a seller: `forbidNonWhitelisted` would turn a
 * removed field into a 400 for every web bundle and native build already
 * in people's hands, and `toSellerListingInput` sends `tags` on every
 * save. Refusing would break saving a listing to enforce a rule the
 * client can simply stop breaking; ignoring costs nothing and closes the
 * hole the same way. The M22 rule about narrowing a request value.
 *
 * `undefined` on update is what makes this safe for the admin's own
 * badges: every seller save posts the form's `tags` back, and writing
 * them would wipe the badge an admin set the next time the maker edited
 * a price.
 *
 * Pure and prisma-free, so the rule is testable without a service.
 */
export function tagsForCreate(
  tags: readonly string[] | undefined,
  options: Pick<ListingWriteOptions, 'actor'>,
): ProductTag[] {
  return options.actor === 'admin' ? ((tags ?? []) as ProductTag[]) : [];
}

/**
 * `undefined` means "leave the column alone" to Prisma — which is the
 * whole answer for a seller, and for an admin edit that did not mention
 * tags. An explicit `[]` from an admin is a real answer ("remove the
 * badges") and is passed through.
 */
export function tagsForUpdate(
  tags: readonly string[] | undefined,
  options: Pick<ListingWriteOptions, 'actor'>,
): ProductTag[] | undefined {
  return options.actor === 'admin' ? (tags as ProductTag[] | undefined) : undefined;
}
