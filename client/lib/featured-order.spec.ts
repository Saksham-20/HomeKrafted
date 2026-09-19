import {
  bestFeatured,
  compareFeatured,
  isFeatured,
  pinFeaturedFirst,
  splitFeatured,
  type FeaturedOrderable,
} from "./featured-order";

/**
 * "Featured first" has to mean the same thing on the server (SQL: `featured
 * DESC, featuredRank ASC NULLS LAST`) and on every screen that re-sorts the
 * page in the browser. These cases are worked by hand from that ORDER BY.
 */

interface Item extends FeaturedOrderable {
  id: string;
}

const item = (id: string, featured?: boolean, featuredRank?: number | null): Item => ({
  id,
  featured,
  featuredRank,
});
const ids = (list: Item[]) => list.map((i) => i.id);

describe("isFeatured", () => {
  it("is true only for a literal true — absent and false are both not featured", () => {
    expect(isFeatured(item("a", true))).toBe(true);
    expect(isFeatured(item("a", false))).toBe(false);
    expect(isFeatured(item("a"))).toBe(false);
  });
});

describe("compareFeatured", () => {
  it("puts a featured listing before an ordinary one, in either argument order", () => {
    expect(compareFeatured(item("f", true), item("o", false))).toBe(-1);
    expect(compareFeatured(item("o", false), item("f", true))).toBe(1);
  });

  it("orders featured listings by rank ascending — lower is earlier", () => {
    expect(compareFeatured(item("a", true, 1), item("b", true, 4))).toBe(-3);
    expect(compareFeatured(item("a", true, 4), item("b", true, 1))).toBe(3);
  });

  it("sorts an unranked featured listing after every ranked one (NULLS LAST)", () => {
    expect(compareFeatured(item("ranked", true, 99), item("unranked", true, null))).toBe(-1);
    expect(compareFeatured(item("unranked", true, null), item("ranked", true, 99))).toBe(1);
    // A server that predates the column sends nothing; it reads as unranked.
    expect(compareFeatured(item("ranked", true, 0), item("absent", true))).toBe(-1);
  });

  it("a rank of 0 is a real rank, not 'unranked'", () => {
    expect(compareFeatured(item("zero", true, 0), item("unranked", true, null))).toBe(-1);
    expect(compareFeatured(item("zero", true, 0), item("one", true, 1))).toBe(-1);
  });

  it("returns 0 on every tie so the caller's own tie-breakers apply", () => {
    expect(compareFeatured(item("a", true, 2), item("b", true, 2))).toBe(0);
    expect(compareFeatured(item("a", true, null), item("b", true))).toBe(0);
    expect(compareFeatured(item("a"), item("b"))).toBe(0);
    expect(compareFeatured(item("a", false), item("b"))).toBe(0);
  });

  it("ignores a stale rank on a listing that is not featured", () => {
    // The invariant is "not featured means no rank", and the writers keep
    // it — but if one ever does not, an unfeatured row must not be lifted
    // by a number nobody is looking at.
    expect(compareFeatured(item("stale", false, 1), item("plain", false, 9))).toBe(0);
    expect(compareFeatured(item("stale", false, 1), item("chosen", true, null))).toBe(1);
  });

  it("treats a non-finite rank as unranked instead of returning NaN", () => {
    expect(compareFeatured(item("nan", true, Number.NaN), item("ranked", true, 3))).toBe(1);
    expect(compareFeatured(item("nan", true, Number.NaN), item("unranked", true, null))).toBe(0);
  });

  it("agrees with the server's ORDER BY when used as a sort comparator", () => {
    // ORDER BY featured DESC, featuredRank ASC NULLS LAST, then a stable
    // tie: featured [rank 1, rank 3, unranked b, unranked d], then plain.
    const list = [
      item("plain1"),
      item("d", true, null),
      item("rank3", true, 3),
      item("plain2", false),
      item("rank1", true, 1),
      item("b", true),
    ];
    expect(ids([...list].sort(compareFeatured))).toEqual([
      "rank1",
      "rank3",
      "d",
      "b",
      "plain1",
      "plain2",
    ]);
  });
});

describe("splitFeatured", () => {
  it("returns featured in rank order and the rest in the order they arrived", () => {
    const { featured, rest } = splitFeatured([
      item("o1"),
      item("f2", true, 2),
      item("o2"),
      item("f1", true, 1),
      item("o3", false),
    ]);
    expect(ids(featured)).toEqual(["f1", "f2"]);
    expect(ids(rest)).toEqual(["o1", "o2", "o3"]);
  });

  it("keeps featured listings tied on rank in the order the caller gave them", () => {
    // The caller sorted best-first; two unranked featured listings must not
    // swap just because a partition ran.
    const { featured } = splitFeatured([item("x", true), item("y", true), item("z", true, 5)]);
    expect(ids(featured)).toEqual(["z", "x", "y"]);
  });

  it("does not mutate the list it was given", () => {
    const list = [item("o"), item("f", true, 1)];
    splitFeatured(list);
    expect(ids(list)).toEqual(["o", "f"]);
  });

  it("handles a list with nothing featured, and an empty one", () => {
    expect(splitFeatured([item("a"), item("b")])).toEqual({ featured: [], rest: [item("a"), item("b")] });
    expect(splitFeatured([])).toEqual({ featured: [], rest: [] });
  });
});

describe("pinFeaturedFirst", () => {
  it("is a stable partition: featured (ranked) first, everyone else untouched", () => {
    const pinned = pinFeaturedFirst([
      item("o1"),
      item("f3", true, 3),
      item("o2"),
      item("f1", true, 1),
      item("fn", true, null),
    ]);
    expect(ids(pinned)).toEqual(["f1", "f3", "fn", "o1", "o2"]);
  });

  it("loses nothing and invents nothing", () => {
    const list = [item("a"), item("b", true), item("c", true, 2), item("d")];
    const pinned = pinFeaturedFirst(list);
    expect(pinned).toHaveLength(list.length);
    expect(new Set(ids(pinned))).toEqual(new Set(ids(list)));
  });

  it("returns a copy — the input is not sorted in place", () => {
    const list = [item("o"), item("f", true, 1)];
    const pinned = pinFeaturedFirst(list);
    expect(pinned).not.toBe(list);
    expect(ids(list)).toEqual(["o", "f"]);
  });

  it("leaves a list with nothing featured exactly as it was", () => {
    expect(ids(pinFeaturedFirst([item("c"), item("a"), item("b")]))).toEqual(["c", "a", "b"]);
  });
});

describe("bestFeatured", () => {
  it("returns the featured listing an admin placed earliest", () => {
    const list = [item("o"), item("f5", true, 5), item("f2", true, 2), item("fn", true, null)];
    expect(bestFeatured(list)?.id).toBe("f2");
  });

  it("prefers a ranked listing over an unranked one wherever they sit", () => {
    expect(bestFeatured([item("unranked", true), item("ranked", true, 40)])?.id).toBe("ranked");
  });

  it("on a tie returns the earliest in the list", () => {
    expect(bestFeatured([item("first", true), item("second", true)])?.id).toBe("first");
  });

  it("is undefined when nothing is featured", () => {
    expect(bestFeatured([item("a"), item("b", false)])).toBeUndefined();
    expect(bestFeatured([])).toBeUndefined();
  });
});
