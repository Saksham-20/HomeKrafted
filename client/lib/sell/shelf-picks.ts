import type { Category } from "@/lib/types";

/** Only what this reads — the form holds a slimmer shape than `Category`. */
export type ShelfCategory = Pick<Category, "id" | "name"> & {
  group?: Category["group"];
  parentId?: string | null;
};

/**
 * The shelf chips on the guided listing flow's "What is it?" step.
 *
 * It used to show the first six *subcategories* of the chosen side and
 * nothing else — so every top-level shelf with no children was missing
 * from the chips entirely. On production that hid "Crochet", "Flowers"
 * and "Self-Care", and somebody listing a crochet soft toy was offered
 * Earrings, Engraved, For Her, Paintings, Scented Candles and Custom
 * Prints, picked "Paintings", and moved on. The full list was only in the
 * combobox underneath, which nobody opens when six chips look like the
 * whole answer.
 *
 * Now every shelf is a chip, grouped the way the browse pages group them
 * (`splitCategorySections`): the childless shelves first, then each
 * parent as a heading over its children. The "Shop by …" groupings
 * (recipient, cuisine, meal) go last, because they say who a thing is for
 * or when it is eaten rather than what it is, and a primary shelf should
 * name what it is.
 *
 * Pure, so the page and the spec agree on it.
 */
export interface ShelfPickGroup<C extends ShelfCategory = ShelfCategory> {
  /** `null` for the run of shelves that have no parent. */
  heading: string | null;
  shelves: C[];
}

export interface ShelfPicks<C extends ShelfCategory = ShelfCategory> {
  /** Shelves whose name appears in what the maker called the product. */
  suggested: C[];
  groups: ShelfPickGroup<C>[];
}

const SUGGESTED_MAX = 3;

/** Lower-case words of 3+ letters, with a trailing plural "s" dropped. */
function stems(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter((word) => word.length >= 3)
    .map((word) => (word.length > 4 && word.endsWith("s") ? word.slice(0, -1) : word));
}

const GENERIC = new Set(["and", "the", "for", "handmade", "gift", "shop", "custom", "home"]);

function isGrouping(parent: ShelfCategory): boolean {
  return /^shop by\b/i.test(parent.name.trim());
}

export function buildShelfPicks<C extends ShelfCategory>(
  categories: C[],
  kind: "food" | "craft",
  productName: string,
): ShelfPicks<C> {
  const onSide = categories.filter((c) => (c.group ?? "food") === kind);

  const childrenByParent = new Map<string, C[]>();
  for (const c of onSide) {
    if (!c.parentId) continue;
    const list = childrenByParent.get(c.parentId) ?? [];
    list.push(c);
    childrenByParent.set(c.parentId, list);
  }

  const flat: C[] = [];
  const typeGroups: ShelfPickGroup<C>[] = [];
  const groupings: ShelfPickGroup<C>[] = [];
  for (const c of onSide) {
    if (c.parentId) continue;
    const children = childrenByParent.get(c.id);
    if (!children || children.length === 0) {
      flat.push(c);
      continue;
    }
    (isGrouping(c) ? groupings : typeGroups).push({ heading: c.name, shelves: children });
  }

  const groups: ShelfPickGroup<C>[] = [
    ...(flat.length > 0 ? [{ heading: null, shelves: flat }] : []),
    ...typeGroups,
    ...groupings,
  ];

  const nameStems = new Set(stems(productName).filter((s) => !GENERIC.has(s)));
  const selectable = groups.flatMap((g) => g.shelves);
  const suggested =
    nameStems.size === 0
      ? []
      : selectable
          .filter((c) => stems(c.name).some((s) => !GENERIC.has(s) && nameStems.has(s)))
          .slice(0, SUGGESTED_MAX);

  return { suggested, groups };
}
