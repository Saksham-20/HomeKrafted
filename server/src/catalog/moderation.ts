import { ProductModerationStatus } from '@prisma/client';

/**
 * Who is allowed to see a listing, in one place.
 *
 * **This file exists because of a specific near-miss.** Until M22 the enum
 * was `active | hidden | flagged` and every public query said
 * `moderationStatus: { not: 'hidden' }` — a denylist, which was exactly
 * equivalent to an allowlist while `hidden` was the only bad state. Adding
 * `pending` broke that equivalence in the worst direction: a denylist
 * publishes every unreviewed listing, so the approval gate would have been
 * decoration and nobody would have noticed, because the listings *do*
 * appear and everything looks like it works.
 *
 * So: browse surfaces filter on `PUBLICLY_LISTED`, never on `{ not: ... }`.
 * A new enum member is then invisible by default, which is the safe way
 * round.
 */

/**
 * The `where` fragment for any surface a buyer browses — search, shop,
 * storefront, snacks menu, meal plans.
 *
 * Spread it (`where: { ...PUBLICLY_LISTED, vendorId }`) rather than
 * hand-writing `moderationStatus: 'active'`, so a future change to what
 * "public" means reaches every caller.
 */
export const PUBLICLY_LISTED = { moderationStatus: 'active' as const };

/**
 * States a listing reaches only by having been reviewed and allowed at
 * some point. A direct link, a cart line, an order line or a wishlist row
 * may still resolve one of these — a taken-down product has to keep
 * rendering in the order history of someone who bought it.
 */
const EVER_PUBLIC: ProductModerationStatus[] = ['active', 'hidden', 'flagged'];

/** True when a buyer may see this listing on a browse or search surface. */
export function isPubliclyListed(status: ProductModerationStatus): boolean {
  return status === 'active';
}

/**
 * True when a direct lookup by slug/id should resolve rather than 404.
 *
 * `pending` and `rejected` are false here, and that is the distinction
 * that makes the gate hold: those two have **never been public**, so
 * nothing legitimately references them and a direct link to one would be
 * a way to preview an unreviewed listing simply by knowing its slug.
 * `hidden` and `flagged` were public once, so their links keep working.
 */
export function isDirectlyResolvable(status: ProductModerationStatus): boolean {
  return EVER_PUBLIC.includes(status);
}

/**
 * True when a listing may be bought — added to a cart, ordered, reordered.
 *
 * Deliberately stricter than `isDirectlyResolvable`: an order that already
 * exists must keep rendering, but nothing new may be bought once an admin
 * has taken the listing down.
 */
export function isPurchasable(status: ProductModerationStatus): boolean {
  return status === 'active';
}

/** The write applied when something goes (back) into the review queue. */
export interface RequeuePatch {
  moderationStatus: 'pending';
  submittedAt: Date;
  /**
   * The previous decision is cleared. It described a version of the
   * listing that no longer exists, and leaving it shows the HomeKrafter a
   * rejection reason against something now waiting for review.
   */
  moderationNote: null;
  moderatedAt: null;
  /**
   * Scalar, not `moderatedBy: { disconnect: true }` — these patches are
   * spread into updates that already set FK scalars like `categoryId`, and
   * Prisma will not accept checked and unchecked input in the same object.
   */
  moderatedById: null;
}

/**
 * Decides whether an edit sends a listing back to the review queue.
 *
 * **The rule, and why it is this one.** Two failures are available and
 * they pull opposite ways. Re-queue on *every* edit and a kitchen
 * correcting a typo or nudging a price goes dark until an admin gets to
 * it — which makes editing something you avoid, and stale listings are
 * how a marketplace rots. Re-queue on *nothing* and approval is a
 * one-time formality: list something innocuous, get approved, then
 * rewrite the name, photo and description into whatever you actually
 * wanted to sell.
 *
 * So the caller passes `changedMaterially` for the fields that carry what
 * the listing *is* — name, description, category, photo. Price, stock,
 * dietary tags and section flags are not material. A seller who doubles
 * their price has done something a buyer can see and complain about; a
 * seller who swaps the photo and description has done something only
 * review catches.
 *
 * A `rejected` listing re-queues on **any** edit — that is the whole route
 * back. `pending` returns no patch: it is already queued, and leaving
 * `submittedAt` alone stops an edit being a way to jump the queue by
 * resubmitting.
 */
export function requeueOnEdit(
  current: ProductModerationStatus,
  changedMaterially: boolean,
): RequeuePatch | Record<string, never> {
  if (current === 'pending') return {};
  if (current !== 'rejected' && !changedMaterially) return {};
  return {
    moderationStatus: 'pending',
    submittedAt: new Date(),
    moderationNote: null,
    moderatedAt: null,
    moderatedById: null,
  };
}

/**
 * The write applied when something is first created. Separate from
 * `requeueOnEdit` only so the create sites read as a statement of intent
 * rather than leaning silently on a column default.
 */
export function initialSubmission(): { moderationStatus: 'pending'; submittedAt: Date } {
  return { moderationStatus: 'pending', submittedAt: new Date() };
}

/**
 * The buyer-facing reason a listing cannot be bought. Never names
 * `pending` or `rejected` to a buyer — that is the HomeKrafter's business
 * with the platform, not a shopper's, and "awaiting review" tells someone
 * browsing that a listing they cannot see exists.
 */
export function unavailableReason(status: ProductModerationStatus): string {
  return status === 'hidden' || status === 'flagged' ? 'No longer available' : 'Not available';
}
