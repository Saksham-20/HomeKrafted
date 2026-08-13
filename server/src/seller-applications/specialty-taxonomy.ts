import { SellerApplicationCategory, SellerSpecialty, VendorType } from '@prisma/client';

/**
 * One question — "what do you make?" — and everything else derived from it.
 *
 * **Why this exists.** The apply form used to ask two overlapping taxonomy
 * questions: a `category` (`maker | baker | artist | home_chef | other`)
 * and a list of `specialties`. The category's only job was to pick a
 * `VendorType`, and `VendorType` is **rendered nowhere** — it is stored,
 * mapped onto every vendor payload, and never read by a single component.
 * A closed loop: a question asked of every applicant to fill a column that
 * only feeds another column nobody looks at.
 *
 * Worse, both taxonomies were food-shaped. `category`'s own schema comment
 * said "the platform is food-first"; a candle maker picked `other`. Asking
 * somebody to classify themselves as a "baker" or an "artist" before they
 * can tell you they make ceramics is the form working against the person
 * filling it in.
 *
 * So the form now asks only what they make, and this derives the rest.
 * `category` stays on the DTO as optional — narrowing an accepted request
 * value would break the native apps, which have no versioning policy (see
 * `CreateSellerApplicationDto`) — but nobody has to send it.
 */

/**
 * Every value the enum carries, in the order a form should offer them.
 *
 * The single list. `CreateSellerApplicationDto` and
 * `UpdateSellerSpecialtiesDto` both validate against this rather than
 * keeping a copy each — two hand-maintained lists of the same enum drift
 * the first time somebody adds a member to one of them, and the symptom
 * is a 400 on a value the schema accepts.
 */
export const ALL_SPECIALTIES: SellerSpecialty[] = [
  // Food
  'homemade_food',
  'bakery',
  'pickles_preserves',
  'snacks',
  'sweets',
  'beverages',
  // Everything else homemade (M22). Before this, `crafts` was the only
  // non-food value on a marketplace that sells everything homemade — so a
  // candle maker, a potter and a jeweller all submitted the same tag.
  'candles',
  'ceramics',
  'textiles',
  'jewellery',
  'art_prints',
  'bath_body',
  'stationery',
  'home_decor',
  'personalised',
  'crafts',
  // Withdrawn module (M19), still accepted on the application endpoint —
  // see `CreateSellerApplicationDto`. Not offerable to a HomeKrafter
  // choosing new tags; see `isWithdrawnSpecialty`.
  'laundry',
  'cleaning',
];

/** Specialties that describe food. Everything else is treated as craft. */
const FOOD_SPECIALTIES: ReadonlySet<SellerSpecialty> = new Set<SellerSpecialty>([
  'homemade_food',
  'bakery',
  'pickles_preserves',
  'snacks',
  'sweets',
  'beverages',
]);

/**
 * The withdrawn module (M19). Neither food nor craft — kept out of the
 * derivation so a legacy row does not tip an applicant into the wrong
 * bucket.
 */
const SERVICE_SPECIALTIES: ReadonlySet<SellerSpecialty> = new Set<SellerSpecialty>([
  'laundry',
  'cleaning',
]);

/**
 * Belongs to the withdrawn module, so it can never be **newly** taken on.
 *
 * A HomeKrafter who already carries one keeps it — the tag is what makes
 * their existing bookings render — but `PATCH /seller/specialties` refuses
 * to add one that is not already there. Offering a service the platform
 * does not run is worse than not offering it: somebody would tick it,
 * wait, and get no bookings, and nothing on the site would explain why.
 */
export function isWithdrawnSpecialty(specialty: SellerSpecialty): boolean {
  return SERVICE_SPECIALTIES.has(specialty);
}

export interface SupplyMix {
  makesFood: boolean;
  makesCraft: boolean;
}

export function supplyMix(specialties: SellerSpecialty[]): SupplyMix {
  return {
    makesFood: specialties.some((s) => FOOD_SPECIALTIES.has(s)),
    makesCraft: specialties.some((s) => !FOOD_SPECIALTIES.has(s) && !SERVICE_SPECIALTIES.has(s)),
  };
}

/**
 * The coarse bucket, derived rather than asked.
 *
 * `home_chef` for anyone making food (including someone who makes both —
 * the food half is what carries the licensing and handling questions, so
 * it is the safer of the two to surface to an admin). `artist` for a pure
 * craft applicant. `other` only when the specialties say nothing either
 * way, which is the honest answer rather than a default guess.
 */
export function categoryForSpecialties(specialties: SellerSpecialty[]): SellerApplicationCategory {
  const { makesFood, makesCraft } = supplyMix(specialties);
  if (makesFood) return 'home_chef';
  if (makesCraft) return 'artist';
  return 'other';
}

/**
 * `Vendor.type`, derived the same way.
 *
 * Kept because the column is `NOT NULL` and rides every vendor payload,
 * not because anything reads it. If a future surface *does* want to
 * distinguish a baker from a potter, `specialties` is the field to read —
 * it is the one with real resolution.
 */
export function vendorTypeForSpecialties(specialties: SellerSpecialty[]): VendorType {
  const { makesFood, makesCraft } = supplyMix(specialties);
  if (makesFood) return specialties.includes('bakery') ? 'baker' : 'maker';
  if (makesCraft) return 'artist';
  return 'maker';
}
