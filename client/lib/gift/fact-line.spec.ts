import { dispatchDays, giftFactLine } from "./fact-line";

/**
 * G3 §5.1 — the card says what a column says, and nothing else.
 *
 * What is worth pinning is not the happy sentence: it is every case where
 * the honest answer is **no line at all**. A card that fills its quiet
 * slot with a guess is the badge chain the 2026-09-14 sweep deleted,
 * growing back one listing at a time.
 */
describe("giftFactLine", () => {
  it("says nothing when the maker answered nothing", () => {
    expect(giftFactLine({})).toBeNull();
  });

  it("never reads a missing fulfilment as ready to ship", () => {
    // The whole asymmetry: promising a dispatch nobody promised costs a
    // real buyer a real date, and the other direction costs a quieter card.
    expect(giftFactLine({ prepTimeMins: 2880 })).toBeNull();
  });

  it("states ready to ship on its own when no time was given", () => {
    expect(giftFactLine({ fulfilment: "ready_to_ship" })).toBe("Ready to ship");
  });

  it("adds the stated days when there are some", () => {
    expect(giftFactLine({ fulfilment: "ready_to_ship", prepTimeMins: 2880 })).toBe(
      "Ready to ship · posted in 2 days",
    );
    expect(giftFactLine({ fulfilment: "made_to_order", prepTimeMins: 10080 })).toBe(
      "Made to order · 7 days",
    );
  });

  it("says one day, not 1 days", () => {
    expect(giftFactLine({ fulfilment: "made_to_order", prepTimeMins: 1440 })).toBe(
      "Made to order · 1 day",
    );
  });

  it("carries personalisable alongside, and alone", () => {
    expect(giftFactLine({ fulfilment: "ready_to_ship", isPersonalisable: true })).toBe(
      "Ready to ship · Personalisable",
    );
    expect(giftFactLine({ isPersonalisable: true })).toBe("Personalisable");
  });

  it("does not print personalisable when it is false", () => {
    // `false` is a real answer meaning no, and it is not a fact worth a line.
    expect(giftFactLine({ isPersonalisable: false })).toBeNull();
  });
});

describe("dispatchDays", () => {
  it("treats a blank and a zero alike as not stated", () => {
    // The `parseStock` lesson: a blank that became 0 took sixteen live
    // listings off sale.
    expect(dispatchDays({})).toBeNull();
    expect(dispatchDays({ prepTimeMins: 0 })).toBeNull();
  });

  it("prints nothing for a time under a day", () => {
    // "Made to order · 3 hours" on a handmade object reads as a mistake.
    expect(dispatchDays({ prepTimeMins: 180 })).toBeNull();
  });

  it("rounds to whole days", () => {
    expect(dispatchDays({ prepTimeMins: 4320 })).toBe(3);
    expect(dispatchDays({ prepTimeMins: 4000 })).toBe(3);
  });
});
