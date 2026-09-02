import { splitCategorySections } from "./category-sections";
import type { Category } from "./types";

const cat = (id: string, name: string, parentId?: string | null): Category => ({
  id,
  slug: id,
  name,
  imagePlaceholder: name,
  productCount: 0,
  parentId: parentId ?? null,
});

describe("splitCategorySections", () => {
  it("keeps childless top-level shelves flat, in the given order", () => {
    const { flat, sections } = splitCategorySections([
      cat("a", "Pickles"),
      cat("b", "Bakery"),
    ]);
    expect(flat.map((c) => c.id)).toEqual(["a", "b"]);
    expect(sections).toEqual([]);
  });

  it("renders an M58 parent as a section over its children, never as a flat row", () => {
    const { flat, sections } = splitCategorySections([
      cat("a", "Pickles"),
      cat("p", "Shop by cuisine"),
      cat("c1", "North Indian", "p"),
      cat("c2", "Punjabi", "p"),
    ]);
    expect(flat.map((c) => c.id)).toEqual(["a"]);
    expect(sections).toHaveLength(1);
    expect(sections[0].parent.id).toBe("p");
    expect(sections[0].children.map((c) => c.id)).toEqual(["c1", "c2"]);
  });

  it("treats a childless parent-shaped row as flat (nothing filed under it)", () => {
    const { flat, sections } = splitCategorySections([cat("p", "Shop by meal")]);
    expect(flat.map((c) => c.id)).toEqual(["p"]);
    expect(sections).toEqual([]);
  });

  it("handles absent parentId (pre-M58 rows) as top-level", () => {
    const legacy = { ...cat("x", "Chutneys") };
    delete (legacy as { parentId?: string | null }).parentId;
    const { flat } = splitCategorySections([legacy]);
    expect(flat.map((c) => c.id)).toEqual(["x"]);
  });
});
