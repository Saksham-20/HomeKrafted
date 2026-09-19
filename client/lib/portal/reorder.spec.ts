import { appendItem, canAppend, moveItem, removeItem } from "./reorder";

describe("moveItem", () => {
  it("swaps an item with the one before it when moving up", () => {
    expect(moveItem(["a", "b", "c"], 1, -1)).toEqual(["b", "a", "c"]);
  });

  it("swaps an item with the one after it when moving down", () => {
    expect(moveItem(["a", "b", "c"], 1, 1)).toEqual(["a", "c", "b"]);
  });

  it("leaves the list alone at either end instead of throwing", () => {
    expect(moveItem(["a", "b", "c"], 0, -1)).toEqual(["a", "b", "c"]);
    expect(moveItem(["a", "b", "c"], 2, 1)).toEqual(["a", "b", "c"]);
  });

  it("leaves the list alone for an index that is not in it", () => {
    expect(moveItem(["a", "b"], -1, 1)).toEqual(["a", "b"]);
    expect(moveItem(["a", "b"], 5, -1)).toEqual(["a", "b"]);
    expect(moveItem([], 0, 1)).toEqual([]);
  });

  it("never mutates its input", () => {
    const list = ["a", "b", "c"];
    moveItem(list, 0, 1);
    expect(list).toEqual(["a", "b", "c"]);
  });
});

describe("removeItem", () => {
  it("drops the item and keeps the order of the rest", () => {
    expect(removeItem(["a", "b", "c"], "b")).toEqual(["a", "c"]);
  });

  it("is a no-op for something that is not there", () => {
    expect(removeItem(["a"], "z")).toEqual(["a"]);
  });
});

describe("appendItem / canAppend", () => {
  it("adds to the back", () => {
    expect(appendItem(["a"], "b", 3)).toEqual(["a", "b"]);
    expect(canAppend(["a"], "b", 3)).toBe("ok");
  });

  it("refuses a duplicate, and says so", () => {
    expect(appendItem(["a", "b"], "a", 3)).toEqual(["a", "b"]);
    expect(canAppend(["a", "b"], "a", 3)).toBe("duplicate");
  });

  it("refuses to grow past the maximum, and says so", () => {
    expect(appendItem(["a", "b"], "c", 2)).toEqual(["a", "b"]);
    expect(canAppend(["a", "b"], "c", 2)).toBe("full");
  });

  it("reports a duplicate before fullness, so an item already in a full list reads as already there", () => {
    expect(canAppend(["a", "b"], "b", 2)).toBe("duplicate");
  });
});
