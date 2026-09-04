import { ApiError } from "@/lib/api/http";
import { addToCartErrorMessage, SOLD_OUT_COPY } from "./add-error";

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
