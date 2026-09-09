import { ApiError } from "@/lib/api/http";
import { addToCartErrorMessage, cartUpdateErrorMessage, SOLD_OUT_COPY } from "./add-error";

describe("addToCartErrorMessage", () => {
  it("turns the server's SKU-naming stock refusal into buyer copy", () => {
    const msg = addToCartErrorMessage(
      new ApiError(400, "ERROR", "Only 2 in stock for rakhi-hamper-400g"),
    );
    expect(msg).toContain("Only 2");
    expect(msg).not.toContain("rakhi-hamper-400g");
  });

  it("says sold out, not 'only 0', when stock is zero", () => {
    expect(addToCartErrorMessage(new ApiError(400, "ERROR", "Only 0 in stock for x-1kg"))).toBe(
      SOLD_OUT_COPY,
    );
  });

  it("names the right party for a delisted product and a signed-out session", () => {
    expect(addToCartErrorMessage(new ApiError(404, "ERROR", "Product not found"))).toMatch(
      /isn't available/,
    );
    expect(addToCartErrorMessage(new ApiError(401, "UNAUTHORIZED", "Unauthorized"))).toMatch(
      /sign in/i,
    );
  });

  it("keeps an unrecognised server sentence verbatim and never returns empty", () => {
    expect(addToCartErrorMessage(new ApiError(400, "ERROR", "Quantity must be positive"))).toBe(
      "Quantity must be positive",
    );
    expect(addToCartErrorMessage("boom")).toMatch(/try again/);
  });
});

describe("cartUpdateErrorMessage", () => {
  it("does not tell somebody removing a line to sign in to add things", () => {
    const msg = cartUpdateErrorMessage(new ApiError(401, "UNAUTHORIZED", "Unauthorized"));
    expect(msg).toMatch(/sign in again/i);
    expect(msg).not.toMatch(/add things/i);
  });

  it("keeps the SKU out of a stock refusal", () => {
    const msg = cartUpdateErrorMessage(
      new ApiError(400, "ERROR", "Only 2 in stock for rakhi-hamper-400g"),
    );
    expect(msg).toContain("Only 2");
    expect(msg).not.toContain("rakhi-hamper-400g");
  });

  it("reads a zero-stock refusal as sold out", () => {
    expect(cartUpdateErrorMessage(new ApiError(400, "ERROR", "Only 0 in stock for x"))).toBe(
      SOLD_OUT_COPY,
    );
  });

  it("names a line that is already gone", () => {
    expect(cartUpdateErrorMessage(new ApiError(404, "NOT_FOUND", "no"))).toMatch(/no longer/i);
  });

  it("never returns empty", () => {
    expect(cartUpdateErrorMessage("boom")).toMatch(/try again/i);
    expect(cartUpdateErrorMessage(new ApiError(0, "NETWORK_ERROR", ""))).toMatch(/try again/i);
  });
});
