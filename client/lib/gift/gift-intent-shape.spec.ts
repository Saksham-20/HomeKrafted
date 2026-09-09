import {
  EMPTY_GIFT_INTENT,
  GIFT_INTENT_KEY,
  hasGiftIntent,
  isWorthStoring,
  parseGiftIntent,
} from "@/lib/gift/gift-intent-shape";

/**
 * The half of the gift hand-off both packages compile.
 *
 * `parseGiftIntent` reads a string somebody could have edited by hand, on
 * the screen where a buyer is paying — so every case here is about it
 * being total. A throw from this function is a checkout that will not
 * render.
 */
describe("parseGiftIntent", () => {
  it("reads a well-formed intent", () => {
    expect(
      parseGiftIntent('{"wrap":true,"messageCard":true,"shipToRecipient":false,"message":"Happy Diwali"}'),
    ).toEqual({
      wrap: true,
      messageCard: true,
      shipToRecipient: false,
      message: "Happy Diwali",
    });
  });

  it("answers empty for anything unparseable, rather than throwing", () => {
    // A private window, a half-written key, a value from an older build.
    for (const raw of ["", "{", "null", "[]", '"a string"', undefined, null, 7]) {
      expect(parseGiftIntent(raw)).toEqual(EMPTY_GIFT_INTENT);
    }
  });

  it("coerces every field, so a wrong type is never carried onto an order", () => {
    // `wrap` reaches `OrderItem.giftWrap`, which a maker reads as an
    // instruction. "yes" as a truthy string is fine; a number as a
    // message is not a message.
    expect(parseGiftIntent({ wrap: 1, messageCard: 0, shipToRecipient: "y", message: 42 })).toEqual({
      wrap: true,
      messageCard: false,
      shipToRecipient: true,
      message: "",
    });
  });

  it("fills in a missing field rather than leaving it undefined", () => {
    expect(parseGiftIntent({ message: "note" })).toEqual({
      wrap: false,
      messageCard: false,
      shipToRecipient: false,
      message: "note",
    });
  });
});

describe("hasGiftIntent", () => {
  it("is false for the empty value", () => {
    // The only reason checkout acts on the hand-off at all.
    expect(hasGiftIntent(EMPTY_GIFT_INTENT)).toBe(false);
  });

  it("is true when any of the three was asked for", () => {
    expect(hasGiftIntent({ ...EMPTY_GIFT_INTENT, wrap: true })).toBe(true);
    expect(hasGiftIntent({ ...EMPTY_GIFT_INTENT, messageCard: true })).toBe(true);
    expect(hasGiftIntent({ ...EMPTY_GIFT_INTENT, shipToRecipient: true })).toBe(true);
  });

  it("is false for a message alone — that is `isWorthStoring`'s question", () => {
    // Deliberately different questions. Checkout should not open its gift
    // section because a box was typed in and then unticked; the store
    // should still keep the words somebody wrote.
    const typed = { ...EMPTY_GIFT_INTENT, message: "for Ma" };
    expect(hasGiftIntent(typed)).toBe(false);
    expect(isWorthStoring(typed)).toBe(true);
  });
});

it("keeps the storage key, so the two stores cannot drift apart", () => {
  // The web writes it in `sessionStorage`; a rename loses a buyer's
  // choices between the product page and checkout, silently.
  expect(GIFT_INTENT_KEY).toBe("hk_gift_intent");
});

it("EMPTY_GIFT_INTENT is not shared by reference with a parse result", () => {
  // Mutating the exported constant would change every future "no gift
  // asked for" in the process.
  const parsed = parseGiftIntent("{}");
  expect(parsed).toEqual(EMPTY_GIFT_INTENT);
  expect(parsed).not.toBe(EMPTY_GIFT_INTENT);
});
