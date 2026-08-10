import { Snack } from '@prisma/client';

export function mapSnack(snack: Snack) {
  return {
    id: snack.id,
    slug: snack.slug,
    name: snack.name,
    description: snack.description,
    price: Number(snack.price),
    category: snack.category,
    diet: snack.diet === 'non_veg' ? 'non-veg' : 'veg',
    imagePlaceholder: snack.imagePlaceholder,
    imageSrc: snack.imageSrc ?? undefined,
    available: snack.available,
    sellerId: snack.sellerId ?? undefined,
  };
}

/**
 * The same snack, plus the review state — for its owner only.
 *
 * `mapSnack` above is the **public** shape and must stay that way:
 * `moderationNote` is an admin's private reason for refusing something,
 * and a buyer has no business reading it (M22 keeps the same split for
 * `Product`).
 *
 * But the seller portal was using the public mapper too, so a rejected
 * snack showed its HomeKrafter *nothing* — not on the menu row, not in
 * the editor. The refusal reason exists precisely so they know what to
 * change, and it was being dropped on the floor between the database and
 * the only person who could act on it.
 */
export function mapSnackForOwner(snack: Snack) {
  return {
    ...mapSnack(snack),
    moderationStatus: snack.moderationStatus,
    moderationNote: snack.moderationNote ?? undefined,
  };
}
