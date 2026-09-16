import { deliverySubtitle, deliveryTitle, isPosted, pincodeMessage } from "./delivery-copy";
import type { Product } from "@/lib/types";

/**
 * The bug this pins, in the owner's words: "mr bean teddy comes as
 * kitchen".
 *
 * A crocheted soft toy was described to buyers as "Tricity delivery in
 * 2–4 hours", "Fresh batch prepared daily", and — on a pincode outside
 * the tricity — "Kitchen delivers within 15 km". Every one of those came
 * from reading `shippingScope` without looking at `kind`, and `local` is
 * the value every craft listed before 2026-09-15 still carries.
 */
const craft = (over: Partial<Product> = {}) =>
  ({ kind: "craft", shippingScope: "local", ...over }) as Product;
const food = (over: Partial<Product> = {}) =>
  ({ kind: "food", shippingScope: "local", ...over }) as Product;

describe("a gift is never described as a kitchen", () => {
  it("posts a craft even when its shippingScope still says local", () => {
    // The teddy exactly: kind craft, scope local, because it was listed
    // before a gift was forced to `national`.
    expect(isPosted(craft())).toBe(true);
    expect(deliveryTitle(craft())).toBe("Posted anywhere in India · 3–5 business days");
  });

  it("never says fresh batch, or a kitchen radius, about a craft", () => {
    expect(deliverySubtitle(craft())).toBeNull();
    const verdict = pincodeMessage(craft(), "140603", "Mohali", false);
    expect(verdict.serviced).toBe(true);
    expect(verdict.message).not.toMatch(/kitchen/i);
    expect(verdict.message).not.toMatch(/fresh/i);
  });

  it("does not read a craft's prep time as minutes", () => {
    // `prepTimeMins` counts days of making on a gift; "(10080 mins
    // notice)" was the other half of the same bug.
    expect(deliverySubtitle(craft({ prepTimeMins: 10080, fulfilment: "made_to_order" }))).toBe(
      "Made to order · 7 days",
    );
  });
});

describe("food keeps the kitchen's own language", () => {
  it("still says tricity for a local dish", () => {
    expect(deliveryTitle(food())).toBe("Tricity delivery in 2–4 hours");
    expect(deliverySubtitle(food())).toBe("Fresh batch prepared daily");
  });

  it("refuses an out-of-range pincode, naming the range", () => {
    const verdict = pincodeMessage(food(), "110001", "Delhi", false);
    expect(verdict.serviced).toBe(false);
    expect(verdict.message).toMatch(/15 km/);
  });

  it("posts a jar of pickle, because that is what shippingScope is for", () => {
    // Some food genuinely posts — the M56 fresh-vs-shippable split. This
    // is the one case where the column still decides.
    expect(isPosted(food({ shippingScope: "national" }))).toBe(true);
  });
});
