/**
 * The icon vocabulary a shelf may be given (G3 §6).
 *
 * `Category.icon` stores one of these ids and **nothing derives an icon
 * from a slug**. A slug→icon map in code is what left seventeen category
 * tiles on the same basket emoji: the map is written once by whoever adds
 * the component and then never again by the people who add shelves, so
 * every shelf minted afterwards is a fallback. Here an admin picks the
 * mark on `/admin/catalog/categories`, and a shelf added next week gets
 * one without a deploy.
 *
 * **Two vocabularies, one per level, never in the same row.**
 *
 * - `craft:*` — the hand-drawn two-tone pine + gold marks in
 *   `components/ui/icons/CraftIcon.tsx` (M33). These are for **department
 *   tiles**, which are the shopfront: a UI-chrome line icon at 40px reads
 *   as a button rather than an offer. They are also the only marks that
 *   exist for Diwali and Rakhi, which no icon set draws.
 * - everything else — monoline icons from `lucide`, `lucide-lab`
 *   (both ISC) and `hugeicons` (MIT), normalised to one 1.5px stroke by
 *   `scripts/build-icons.mjs` and committed as
 *   `icon-bodies.generated.ts`. These are for **subcategory chips, filter
 *   rows and attribute options** — small, dense, beside words.
 *
 * No attribution is owed for any set here, and nothing is fetched at
 * build time or at request time: the bodies are committed, the same
 * stance as `scripts/build-chef-avatars.mjs`.
 *
 * Strings only — no import, no type beyond the literals — so this file
 * passes `shared-boundary.spec.ts` and the native app reads the same
 * list.
 */

/** A shelf whose `icon` is empty or unrecognised draws this. */
export const FALLBACK_ICON_ID = "craft:gift";

/**
 * Every id an admin may choose, grouped the way the picker shows them.
 *
 * `label` describes the **drawing**, not the shelf — the same rule as the
 * chef characters. An admin filing "Bangles & Kadas" is looking for a
 * circle, and a label reading "Bangles" would be a second taxonomy to
 * keep in step with the first.
 */
export const ICON_GROUPS: { group: string; icons: { id: string; label: string }[] }[] = [
  {
    group: "Department marks (hand-drawn)",
    icons: [
      { id: "craft:gift", label: "Wrapped gift" },
      { id: "craft:jewellery", label: "Earring and gem" },
      { id: "craft:candles", label: "Lit candle" },
      { id: "craft:art-prints", label: "Framed picture" },
      { id: "craft:home-decor", label: "Vase and toran" },
      { id: "craft:self-care", label: "Soap and leaf" },
      { id: "craft:kids", label: "Yarn bear" },
      { id: "craft:flowers", label: "Single bloom" },
      { id: "craft:chocolates", label: "Chocolate square" },
      { id: "craft:kitchen", label: "Mug and saucer" },
      { id: "craft:personalised", label: "Tag and thread" },
    ],
  },
  {
    group: "Worn and carried",
    icons: [
      { id: "hugeicons:ear-rings-01", label: "Earrings" },
      { id: "hugeicons:necklace", label: "Necklace" },
      { id: "lucide-lab:gem-ring", label: "Ring with a stone" },
      { id: "lucide:circle-dot", label: "Bangle" },
      { id: "lucide:link", label: "Chain links" },
      { id: "lucide:shopping-bag", label: "Drawstring pouch" },
      { id: "lucide:scissors", label: "Scissors" },
      { id: "lucide:gem", label: "Gem" },
    ],
  },
  {
    group: "Light and flame",
    icons: [
      { id: "lucide:flame", label: "Flame" },
      { id: "lucide-lab:candle-holder", label: "Candle in a holder" },
      { id: "lucide:lamp", label: "Lantern" },
      { id: "lucide:sparkles", label: "Sparkles" },
    ],
  },
  {
    group: "Art and walls",
    icons: [
      { id: "lucide:palette", label: "Paint palette" },
      { id: "lucide:frame", label: "Picture frame" },
      { id: "lucide:printer", label: "Printer" },
      { id: "lucide:user-round", label: "Portrait bust" },
      { id: "lucide:image", label: "Picture" },
      { id: "lucide:wind", label: "Hanging strands" },
      { id: "lucide:box", label: "Box" },
    ],
  },
  {
    group: "Bath and skin",
    icons: [
      { id: "lucide-lab:soap-bar", label: "Bar of soap" },
      { id: "lucide:droplet", label: "Single drop" },
      { id: "lucide:droplets", label: "Two drops" },
      { id: "lucide:hand-heart", label: "Hand holding a heart" },
    ],
  },
  {
    group: "Growing things",
    icons: [
      { id: "lucide-lab:flower-rose-single", label: "Single rose" },
      { id: "lucide:flower-2", label: "Open flower" },
      { id: "lucide:sprout", label: "Seedling" },
      { id: "lucide:leaf", label: "Leaf" },
      { id: "hugeicons:plant-02", label: "Potted plant" },
    ],
  },
  {
    group: "Children",
    icons: [
      { id: "lucide-lab:yarn-ball", label: "Ball of yarn" },
      { id: "lucide:baby", label: "Baby" },
      { id: "lucide:bed", label: "Bed" },
    ],
  },
  {
    group: "Kitchen and edible",
    icons: [
      { id: "hugeicons:chocolate", label: "Chocolate bar" },
      { id: "lucide:cookie", label: "Cookie" },
      { id: "lucide:candy", label: "Wrapped sweet" },
      { id: "lucide-lab:jar", label: "Lidded jar" },
      { id: "lucide:coffee", label: "Mug" },
      { id: "lucide:soup", label: "Bowl" },
      { id: "lucide-lab:bowl-chopsticks", label: "Bowl and chopsticks" },
      { id: "lucide:square", label: "Square tray" },
      { id: "lucide:utensils", label: "Fork and knife" },
      { id: "lucide:croissant", label: "Croissant" },
      { id: "lucide:cake", label: "Cake" },
      { id: "lucide:popcorn", label: "Popcorn" },
      { id: "lucide:salad", label: "Salad bowl" },
      { id: "lucide:wheat", label: "Ear of wheat" },
    ],
  },
  {
    group: "Boxes and sets",
    icons: [
      { id: "lucide:gift", label: "Gift box" },
      { id: "lucide:package", label: "Parcel" },
      { id: "lucide:heart", label: "Heart" },
      { id: "lucide:star", label: "Star" },
      { id: "lucide:shirt", label: "Shirt" },
    ],
  },
];

/** Flat list of every allowed id, in picker order. */
export const ICON_IDS: string[] = ICON_GROUPS.flatMap((group) =>
  group.icons.map((icon) => icon.id),
);

/** The hand-drawn half — drawn by `CraftIcon`, not by a generated body. */
export function isCraftIconId(id: string): boolean {
  return id.startsWith("craft:");
}

/** Human label for an id, for the admin picker and nothing else. */
export function iconLabel(id: string): string | undefined {
  for (const group of ICON_GROUPS) {
    const found = group.icons.find((icon) => icon.id === id);
    if (found) return found.label;
  }
  return undefined;
}
