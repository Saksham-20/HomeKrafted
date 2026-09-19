import type { Department, DepartmentChild } from "@/lib/api/catalog";
import { productShelves } from "@/lib/browse-facets";
import type { Category, Product } from "@/lib/types";

export interface CategorySectionSplit {
  /** Top-level shelves with no children — the flat run at the top. */
  flat: Category[];
  /** Each M58 parent with its children — rendered as labelled sections. */
  sections: { parent: Category; children: Category[] }[];
}

/**
 * Split one vertical's categories into the flat shelf list and the M58
 * parent trees (M59). Before this, the filter sidebar rendered the tree
 * flattened: "Shop by cuisine" appeared as one more checkbox in the
 * middle of the alphabet, permanently zero-count (nothing files
 * *directly* under a parent yet), with its own cuisines scattered
 * elsewhere in the same list. The parent's job in a facet list is to be
 * a heading.
 *
 * Pure and order-preserving — the caller's category order (the API's)
 * is kept within each bucket, so this cannot disagree with the grid.
 */
/**
 * A shelf and its children, as the ids a listing may sit on to count as
 * "on this shelf" (2026-09-16, docs/GIFTING-REWORK.md D3).
 *
 * CLAUDE.md M58 says a parent is browsable and matches its children. The
 * browse pages never did it: a parent rendered as a heading with no chip
 * and no checkbox, so the 30 jewellery and 11 candle listings filed
 * directly on a parent shelf — 48% of live gifts — could not be reached by
 * any category filter. A parent matches listings filed on itself too, which
 * is exactly those rows.
 */
export function shelfFamily(categoryId: string, categories: readonly Category[]): string[] {
  return [categoryId, ...categories.filter((c) => c.parentId === categoryId).map((c) => c.id)];
}

/**
 * Every shelf id a selection covers, parents expanded to their children.
 * Pass the result to `productMatchesFacets`, which stays a plain set lookup.
 */
export function expandShelfSelection(
  selected: Iterable<string>,
  categories: readonly Category[],
): Set<string> {
  const out = new Set<string>();
  for (const id of selected) for (const shelf of shelfFamily(id, categories)) out.add(shelf);
  return out;
}

export function splitCategorySections(categories: Category[]): CategorySectionSplit {
  const childrenByParent = new Map<string, Category[]>();
  for (const category of categories) {
    if (!category.parentId) continue;
    const list = childrenByParent.get(category.parentId) ?? [];
    list.push(category);
    childrenByParent.set(category.parentId, list);
  }

  const flat: Category[] = [];
  const sections: CategorySectionSplit["sections"] = [];
  for (const category of categories) {
    if (category.parentId) continue; // rendered under its parent
    const children = childrenByParent.get(category.id);
    if (children && children.length > 0) sections.push({ parent: category, children });
    else flat.push(category);
  }
  return { flat, sections };
}

/**
 * The one category a browse URL names, as an id — or `null` for "All".
 *
 * **A category is a scope, not a filter (2026-09-19, owner: "pressing on a
 * category should change the category, not add them").** The URL codec
 * still carries `categories: string[]` because the native app compiles
 * `lib/browse-params.ts` and holds a multi-select rail of its own until it
 * is moved separately; the web reads that list through this function and
 * keeps **the first token that resolves**.
 *
 * - `?category=a,b` is a link somebody was sent before the change. It opens
 *   on `a`, and `useBrowseFilters`' first-run guard rewrites the address
 *   bar to `?category=a`, so the URL stops claiming a state the page is not
 *   in.
 * - **An unknown token is skipped, not fatal.** `?category=gone,pickles`
 *   opens on Pickles, and `?category=gone` opens on All — a link to a shelf
 *   that has been renamed shows the catalogue, never "nothing matches".
 *   That is also why a craft slug on `/shop` (or a food slug on `/gifts`)
 *   means All: each page hands over only its own vertical's categories.
 * - **A token names a category by slug, and failing that by id.** The URL
 *   only ever carries slugs (`ct3` would tie a shared link to a primary
 *   key), but a caller already holding ids should not have to translate.
 *   Slug wins if the two ever collide.
 */
export function resolveCategorySelection(
  tokens: readonly string[],
  categories: readonly Category[],
): string | null {
  for (const token of tokens) {
    const named = categories.find((c) => c.slug === token) ?? categories.find((c) => c.id === token);
    if (named) return named.id;
  }
  return null;
}

/**
 * The URL's side of `resolveCategorySelection`: at most one slug.
 *
 * Empty for All, and for an id no category carries — a stale selection must
 * not write a `category=` the next reader would drop anyway.
 */
export function categorySlugsForUrl(
  categoryId: string | null,
  categories: readonly Category[],
): string[] {
  if (!categoryId) return [];
  const slug = categories.find((c) => c.id === categoryId)?.slug;
  return slug ? [slug] : [];
}

/**
 * A shelf and everything above it, **top-level first, itself last** — the
 * order a breadcrumb reads. `[]` for an id nobody carries.
 *
 * The tree is one level deep (M58), so this is one or two entries in
 * practice; it walks rather than assuming so, and stops on a repeated id,
 * because `parentId` is admin-editable data and a loop must end a render,
 * not hang it. A parent missing from `categories` (a page hands over only
 * its own vertical) simply ends the chain early.
 */
export function categoryAncestry(id: string, categories: readonly Category[]): Category[] {
  const byId = new Map(categories.map((c) => [c.id, c]));
  const chain: Category[] = [];
  const seen = new Set<string>();
  let current = byId.get(id);
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    chain.unshift(current);
    current = current.parentId ? byId.get(current.parentId) : undefined;
  }
  return chain;
}

/**
 * How many listings sit on each shelf — every shelf a listing is filed
 * under (M58), not its primary alone, and **a parent counts its whole
 * family once per listing** (D3): a piece filed on two of one parent's
 * children is one piece under it, not two.
 *
 * Static totals over whatever list it is handed, never faceted by the other
 * filters — the rail says how much is on a shelf, the grid says how much of
 * that survived the filters.
 */
export function shelfCounts(
  products: readonly Product[],
  categories: readonly Category[],
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const product of products) {
    // A Set, so a listing whose extras repeat its primary counts once.
    for (const shelf of new Set(productShelves(product))) {
      counts.set(shelf, (counts.get(shelf) ?? 0) + 1);
    }
  }
  for (const parent of categories.filter((c) => categories.some((child) => child.parentId === c.id))) {
    const family = new Set(shelfFamily(parent.id, categories));
    counts.set(
      parent.id,
      products.filter((product) => productShelves(product).some((shelf) => family.has(shelf))).length,
    );
  }
  return counts;
}

/**
 * The department strip with the chosen shelf kept on it, even when empty
 * (2026-09-19, `/gifts`).
 *
 * `GET /catalog/departments` returns only shelves with something live (D2),
 * but `resolveCategorySelection` resolves a shared link against **every**
 * shelf — so `?category=earrings` with no live earrings selects a shelf the
 * strip does not draw: no tile checked, "All" unchecked, no child row, and
 * the page looking as though nothing is chosen while the grid says "nothing
 * here". `/shop` keeps its chosen chip when it is empty for this reason; this
 * is the same rule for the department strip.
 *
 * Returns `departments` **unchanged** (same array) when the selection is
 * already on the strip, is `null`, or names no shelf at all — an unknown id
 * has nothing to retain. Otherwise a zero-count entry is added: the shelf
 * itself when it is top-level, or a child under its parent (the parent too
 * when *it* was dropped). It is appended, so nothing that was on the strip
 * moves.
 */
export function withSelectedShelf(
  departments: readonly Department[],
  selectedId: string | null,
  categories: readonly Category[],
): readonly Department[] {
  if (!selectedId) return departments;
  const onStrip = departments.some(
    (department) =>
      department.id === selectedId || department.children.some((child) => child.id === selectedId),
  );
  if (onStrip) return departments;

  const shelf = categories.find((c) => c.id === selectedId);
  if (!shelf) return departments;

  const asChild = (c: Category): DepartmentChild => ({
    id: c.id,
    slug: c.slug,
    name: c.name,
    icon: c.icon ?? null,
    count: 0,
  });
  const asDepartment = (c: Category, children: DepartmentChild[]): Department => ({
    id: c.id,
    slug: c.slug,
    name: c.name,
    description: null,
    icon: c.icon ?? null,
    count: 0,
    imageSrc: null,
    children,
  });

  const parent = shelf.parentId ? categories.find((c) => c.id === shelf.parentId) : undefined;
  if (!parent) return [...departments, asDepartment(shelf, [])];

  const existing = departments.find((department) => department.id === parent.id);
  if (existing) {
    return departments.map((department) =>
      department.id === parent.id
        ? { ...department, children: [...department.children, asChild(shelf)] }
        : department,
    );
  }
  return [...departments, asDepartment(parent, [asChild(shelf)])];
}
