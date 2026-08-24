import type { ComboboxOption } from "@/components/ui/Combobox";
import {
  createOccasion,
  createTaxonomySuggestion,
} from "@/lib/api";
import type { ProductKind } from "@/lib/types";

/**
 * What a listing form may do when the shelf or occasion somebody wants is
 * not on the list (M50).
 *
 * Two roles, two different verbs, and the difference is deliberate:
 *
 * - An **admin** mints the row — they can see the whole list, which is
 *   what makes them the one who can tell a genuine gap from a synonym.
 * - A **HomeKrafter** asks for it. Letting them add one outright is what
 *   `server/test/unit/occasion-admin-only.spec.ts` exists to prevent:
 *   `Category` and `Occasion` are a shared vocabulary the whole catalogue
 *   browses by, and one anybody can append to stops being one — "Pickles",
 *   "Pickle" and "Achaar" as three half-empty shelves nothing can merge.
 *
 * Before this, the seller's picker said *"Ask an admin to add it"* and
 * there was no way to. That is the hole this fills, and it fills it
 * without handing out the write.
 *
 * **The gate is the server, not this file.** Both seller routes live under
 * `/seller/*` and write only `TaxonomySuggestion`; both admin routes live
 * under `/api/v1/admin`, where `RolesGuard` is fail-closed. Withholding a
 * prop hides a row in a menu and nothing more.
 */
export interface ListingTaxonomyActions {
  /** Admin: create the occasion now, and select it. */
  createOccasion?: (name: string) => Promise<ComboboxOption | undefined>;
  /** HomeKrafter: file the ask. Resolves to the sentence shown under the field. */
  suggestOccasion?: (name: string) => Promise<string>;
  /**
   * HomeKrafter: file the ask for a shelf. `group` is the form's own
   * "something to eat / something to keep" answer, passed through rather
   * than guessed at review time — the person filling the form has already
   * answered it.
   */
  suggestCategory?: (name: string, group: ProductKind) => Promise<string>;
}

const SENT = "Sent. We’ll look at it and let you know — pick the closest shelf for now.";
const SENT_OCCASION = "Sent. We’ll look at it and let you know.";

/** What a HomeKrafter's listing forms get. */
export const sellerTaxonomyActions: ListingTaxonomyActions = {
  async suggestCategory(name, group) {
    await createTaxonomySuggestion({ kind: "category", name, group });
    return SENT;
  },
  async suggestOccasion(name) {
    await createTaxonomySuggestion({ kind: "occasion", name });
    return SENT_OCCASION;
  },
};

/**
 * What an admin's listing forms get.
 *
 * No `suggestCategory`: an admin has nobody to ask. Creating a category
 * from inside the listing form is deliberately **not** offered either —
 * a shelf carries artwork and a running order on the shopfront, so it is
 * made on the catalogue screen with those fields in front of you, not as
 * a side effect of typing a product. An occasion is a name and a date,
 * which is why that one is offered here.
 */
export const adminTaxonomyActions: ListingTaxonomyActions = {
  async createOccasion(name) {
    const created = await createOccasion({ name });
    return { value: created.id, label: created.name };
  },
};
