import { merchandisingBadge } from "./merchandising-badge";
import type { Product } from "@/lib/types";

/**
 * The badge chain is short on purpose: every word on it reports something
 * a person did. These cases pin the order, and that "Featured" is only ever
 * the last resort reading the real column.
 */

const card = (over: Partial<Pick<Product, "tags" | "featured">> = {}) => ({ tags: [], ...over });
const NOT_RECENT = { recentlyCreated: false };
const RECENT = { recentlyCreated: true };

describe("merchandisingBadge", () => {
  it("shows nothing when nobody set anything — most cards carry no badge", () => {
    expect(merchandisingBadge(card(), NOT_RECENT)).toBeUndefined();
    expect(merchandisingBadge(card({ featured: false }), RECENT)).toBeUndefined();
  });

  it("falls back to Featured only when an admin featured the listing", () => {
    expect(merchandisingBadge(card({ featured: true }), NOT_RECENT)).toBe("Featured");
  });

  it("reads the column literally — an absent flag is not featured", () => {
    expect(merchandisingBadge({ tags: [] }, NOT_RECENT)).toBeUndefined();
  });

  it("gives every specific tag priority over Featured, in the documented order", () => {
    const featured = { featured: true as const };
    expect(merchandisingBadge(card({ ...featured, tags: ["Bestseller", "Festive", "Curated", "New"] }), RECENT)).toBe("Bestseller");
    expect(merchandisingBadge(card({ ...featured, tags: ["Festive", "Curated", "New"] }), RECENT)).toBe("Festive");
    expect(merchandisingBadge(card({ ...featured, tags: ["Curated", "New"] }), RECENT)).toBe("Curated");
    expect(merchandisingBadge(card({ ...featured, tags: ["New"] }), RECENT)).toBe("New");
  });

  it("wears Featured, not a stale New, once the listing is no longer recent", () => {
    // New is a claim about age and only holds while it is true.
    expect(merchandisingBadge(card({ featured: true, tags: ["New"] }), NOT_RECENT)).toBe("Featured");
    expect(merchandisingBadge(card({ tags: ["New"] }), NOT_RECENT)).toBeUndefined();
  });

  it("wears nothing when sold out, featured or not", () => {
    expect(merchandisingBadge(card({ featured: true, tags: ["Bestseller"] }), { soldOut: true, recentlyCreated: true })).toBeUndefined();
  });

  it("tolerates a payload with no tags array", () => {
    expect(merchandisingBadge({ featured: true } as Pick<Product, "tags" | "featured">, NOT_RECENT)).toBe("Featured");
  });
});
