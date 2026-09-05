import { dietOf, hasDietMark } from "./diet";
import { isPreOrder, preOrderLabel, PRE_ORDER_THRESHOLD_MINS } from "./pre-order";

const listing = (dietary: string[]) => ({ dietary } as Parameters<typeof dietOf>[0]);

describe("dietOf", () => {
  it("reports veg only when the maker said so", () => {
    expect(dietOf(listing(["vegetarian"]))).toBe("veg");
    expect(dietOf(listing(["vegan"]))).toBe("veg");
  });

  it("reports non-veg only when the maker said so", () => {
    expect(dietOf(listing(["non-vegetarian"]))).toBe("non-veg");
  });

  /**
   * The rule this whole module exists for. Before 2026-09-05 `DietaryTag`
   * had no non-veg member, so every "is this non-veg" question in the
   * codebase was answered by the absence of `vegetarian` — which is also
   * how a candle, and every food listing whose maker was never asked,
   * answers it.
   */
  it("answers nothing for a listing that was never asked", () => {
    expect(dietOf(listing([]))).toBeUndefined();
    expect(dietOf(listing(["gluten-free"]))).toBeUndefined();
    expect(hasDietMark(listing(["contains-nuts"]))).toBe(false);
  });

  /**
   * Egg is not a third mark: FSSAI's scheme has two, and whether egg
   * counts as vegetarian is answered differently by different people. It
   * is a filterable fact that leaves the veg/non-veg question where the
   * maker left it.
   */
  /**
   * The form makes the two chips exclusive, but a payload can arrive
   * from a native client or an import carrying both. Contradictory data
   * resolves to the reading that cannot mislead a vegetarian buyer.
   */
  it("resolves contradictory tags to non-veg, never to veg", () => {
    expect(dietOf(listing(["vegetarian", "non-vegetarian"]))).toBe("non-veg");
    expect(dietOf(listing(["vegan", "non-vegetarian"]))).toBe("non-veg");
  });

  it("does not let contains-egg decide the mark", () => {
    expect(dietOf(listing(["contains-egg"]))).toBeUndefined();
    expect(dietOf(listing(["vegetarian", "contains-egg"]))).toBe("veg");
  });
});

describe("isPreOrder", () => {
  it("is false for a listing with no stated notice", () => {
    // Not "no notice needed" — nobody asked. A fallback to the kitchen's
    // own prep time would default to 90 minutes and badge everything.
    expect(isPreOrder({ prepTimeMins: undefined })).toBe(false);
  });

  it("treats the threshold itself as not a pre-order", () => {
    expect(isPreOrder({ prepTimeMins: PRE_ORDER_THRESHOLD_MINS })).toBe(false);
    expect(isPreOrder({ prepTimeMins: PRE_ORDER_THRESHOLD_MINS + 1 })).toBe(true);
  });

  it("labels in the unit a person would plan around", () => {
    expect(preOrderLabel({ prepTimeMins: 45 })).toBe("Pre-order · 45 mins");
    expect(preOrderLabel({ prepTimeMins: 60 })).toBe("Pre-order · 1 hour");
    expect(preOrderLabel({ prepTimeMins: 300 })).toBe("Pre-order · 5 hours");
    expect(preOrderLabel({ prepTimeMins: 2880 })).toBe("Pre-order · 2 days");
  });

  it("has no label when there is no badge", () => {
    expect(preOrderLabel({ prepTimeMins: 20 })).toBeUndefined();
    expect(preOrderLabel({ prepTimeMins: undefined })).toBeUndefined();
  });
});
