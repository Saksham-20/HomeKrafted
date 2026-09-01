import { parentForSuggestion } from "./taxonomy-actions";

/**
 * Where a "there's no shelf for this" ask gets filed (M58).
 *
 * The rule is deliberately not clever, and this pins the *not clever*
 * part: turning a plain top-level shelf into a parent because somebody
 * asked for a neighbouring name is a structural decision about the
 * catalogue, and that belongs to an admin on the approve form.
 */
const CATEGORIES = [
  { id: "meal", parentId: null }, // a parent — has children below
  { id: "breakfast", parentId: "meal" },
  { id: "desserts", parentId: "meal" },
  { id: "pickles", parentId: null }, // a plain top-level shelf, no children
];

describe("parentForSuggestion", () => {
  it("files under the parent when a subcategory is selected", () => {
    // They are missing a *sibling* of Breakfast, so it belongs beside it.
    expect(parentForSuggestion(CATEGORIES, "breakfast")).toBe("meal");
  });

  it("files under the group when the group itself is selected", () => {
    expect(parentForSuggestion(CATEGORIES, "meal")).toBe("meal");
  });

  it("does NOT invent a parent out of a childless top-level shelf", () => {
    // "Pickles" has no children. Quietly making it one because somebody
    // asked for "Achaar" restructures the catalogue on a guess.
    expect(parentForSuggestion(CATEGORIES, "pickles")).toBeNull();
  });

  it("is null when nothing is selected or the id is unknown", () => {
    expect(parentForSuggestion(CATEGORIES, "")).toBeNull();
    expect(parentForSuggestion(CATEGORIES, "no-such-id")).toBeNull();
  });

  it("is null against an empty catalogue rather than throwing", () => {
    expect(parentForSuggestion([], "anything")).toBeNull();
  });
});
