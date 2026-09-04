
import { isDirty } from "./dirty";

describe("isDirty", () => {
  it("is clean while either side is still loading", () => {
    expect(isDirty(undefined, { a: 1 })).toBe(false);
    expect(isDirty({ a: 1 }, undefined)).toBe(false);
  });

  it("compares structurally, not by identity", () => {
    expect(isDirty({ a: "x", days: [1, 2] }, { a: "x", days: [1, 2] })).toBe(false);
    expect(isDirty({ a: "x", days: [1, 2] }, { a: "x", days: [1] })).toBe(true);
    expect(isDirty({ a: "x" }, { a: "y" })).toBe(true);
  });
});
