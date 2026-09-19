/**
 * What a listing page says when its grid is empty, and which ways out it
 * offers (2026-09-19).
 *
 * **The message has to name the category, because the category is no
 * longer in the filter chips.** It used to be one of them, so "Nothing
 * matches Pickles + Pure veg" carried both halves of the cause. Now a
 * category is a scope (`lib/category-sections.ts#resolveCategorySelection`)
 * and the chips are filters only, so a sentence built from chips alone
 * would blame "Pure veg" for an empty shelf.
 *
 * Two ways out, and they are not the same:
 * - **Clear filters** keeps the shelf and drops the refinements — offered
 *   only when there are some, or it is a button that changes nothing.
 * - **Show all** leaves the shelf too (and drops the filters with it: a
 *   dead end wants one press back to the whole catalogue, not a second
 *   guess about which half was the cause) — offered only inside a shelf,
 *   where "all" is a bigger set than what is on screen.
 *
 * Pure strings, no clock and no DOM: `/shop` and `/gifts` share it and the
 * native app can.
 */
export interface EmptyBrowseInput {
  /** Plural, lower-case, what the page lists: "gifts", "dishes", "kitchens". */
  noun: string;
  /** The active category, with its parent's name when it is a subcategory. */
  category: { name: string; parentName?: string | null } | null;
  /** Labels of the active filters — never the category. */
  filterLabels: readonly string[];
  priceNarrowed: boolean;
}

export interface EmptyBrowseCopy {
  headline: string;
  /** `null` when there is nothing useful to add. */
  hint: string | null;
  /** Filters (or a narrowed price) are active — "Clear filters" is a real action. */
  canClearFilters: boolean;
  /** A category is active — "Show all" leaves it. */
  canShowAll: boolean;
}

export function describeEmptyBrowse({
  noun,
  category,
  filterLabels,
  priceNarrowed,
}: EmptyBrowseInput): EmptyBrowseCopy {
  const hasFilters = filterLabels.length > 0 || priceNarrowed;
  const where = category
    ? category.parentName
      ? `${category.name} (in ${category.parentName})`
      : category.name
    : null;

  const filterPhrase = filterLabels.join(" + ");
  const tail =
    filterPhrase && priceNarrowed
      ? `matches ${filterPhrase} in this price range`
      : filterPhrase
        ? `matches ${filterPhrase}`
        : "is in this price range";

  let headline: string;
  let hint: string | null;
  if (where && hasFilters) {
    headline = `Nothing in ${where} ${tail}.`;
    hint = `Every filter narrows the same shelf — loosen one and the ${noun} come back.`;
  } else if (where) {
    headline = `No ${noun} in ${where} right now.`;
    hint = "Try another category, or show everything.";
  } else if (hasFilters) {
    headline = `Nothing ${tail}.`;
    hint = `Every filter narrows the same catalogue — loosen one and the ${noun} come back.`;
  } else {
    headline = "Nothing matches this view.";
    hint = null;
  }

  return { headline, hint, canClearFilters: hasFilters, canShowAll: category !== null };
}
