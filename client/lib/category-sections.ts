import type { Category } from "@/lib/types";

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
