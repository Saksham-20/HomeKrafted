import type { Occasion } from "@/lib/types";

/**
 * The "shop by occasion" tiles from the prototype home page, plus the two
 * dated festivals M16 added for the occasion hub.
 *
 * `celebratedOn` is an absolute date, not a recurrence — Diwali, Raksha
 * Bandhan and Karwa Chauth are lunisolar and land on a different
 * Gregorian date every year, so these are the real 2026 dates and an
 * admin rolls them forward. Evergreen occasions (a birthday has no
 * season) carry none, and `/collections` lists those separately.
 */
export const occasions: Occasion[] = [
  { id: "oc1", slug: "birthday", name: "Birthday", initial: "B", tagline: "Something better than a cake voucher." },
  { id: "oc2", slug: "anniversary", name: "Anniversary", initial: "A", tagline: "For the couple who already own everything." },
  { id: "oc3", slug: "diwali", name: "Diwali", initial: "D", celebratedOn: "2026-11-08", tagline: "Mithai, dry fruit and hampers that leave a tricity kitchen, not a warehouse." },
  { id: "oc4", slug: "housewarming", name: "Housewarming", initial: "H", tagline: "Turn up with something they will finish." },
  { id: "oc5", slug: "corporate", name: "Corporate", initial: "C", tagline: "Client and team gifting that does not taste like a courier box." },
  { id: "oc6", slug: "baby-shower", name: "Baby Shower", initial: "B", tagline: "Gentle, home-made, nothing with a novelty slogan." },
  { id: "oc7", slug: "wedding", name: "Wedding", initial: "W", tagline: "Favours and welcome hampers in real quantities." },
  { id: "oc8", slug: "thank-you", name: "Thank You", initial: "T", tagline: "When \"thanks\" needs to arrive in a jar." },
  { id: "oc9", slug: "raksha-bandhan", name: "Raksha Bandhan", initial: "R", celebratedOn: "2026-08-28", tagline: "Sweets, chocolate and handmade gifts for a brother or a sister, made in a tricity kitchen." },
  { id: "oc10", slug: "karwa-chauth", name: "Karwa Chauth", initial: "K", celebratedOn: "2026-10-29", tagline: "Sargi and after-moonrise food, cooked that morning." },
];

export function getOccasionBySlug(slug: string): Occasion | undefined {
  return occasions.find((o) => o.slug === slug);
}
