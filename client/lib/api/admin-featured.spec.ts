/**
 * The featured list (`/admin/catalog/featured`, 2026-09-19) — the two
 * halves of `lib/api/admin.ts` that back it, in both modes.
 *
 * **Real mode** is a thin transport, so what is pinned is the contract the
 * screen depends on: which path and body go out, and that a refusal comes
 * back as a rejection. The M36 rule — a `lib/api` write that turns a
 * rejected promise into a resolved one makes every `catch` built on top of
 * it unreachable, and Save reads as a dead button.
 *
 * **Mock mode** must behave like the server (`AdminCatalogService`), or
 * local dev with `NEXT_PUBLIC_USE_MOCK=true` exercises a different product:
 * array position is the rank, the write is a full replacement, an unknown
 * id is refused by name, and `unfeature` clears the rank.
 *
 * Expected values reasoned by hand.
 */

let mockMode = false;

jest.mock("./http", () => {
  const actual = jest.requireActual("./http");
  return {
    ...actual,
    isMockMode: () => mockMode,
    http: { get: jest.fn(), put: jest.fn() },
  };
});

import { products } from "@/lib/data";
import {
  MAX_FEATURED_PRODUCTS,
  getFeaturedProducts,
  moderateProduct,
  setFeaturedProducts,
} from "./admin";
import { ApiError, http } from "./http";

const get = http.get as jest.MockedFunction<typeof http.get>;
const put = http.put as jest.MockedFunction<typeof http.put>;

describe("real mode", () => {
  beforeEach(() => {
    mockMode = false;
    get.mockReset();
    put.mockReset();
  });

  it("reads the list from GET /admin/catalog/featured", async () => {
    get.mockResolvedValueOnce({ items: [], total: 0 });
    await expect(getFeaturedProducts()).resolves.toEqual({ items: [], total: 0 });
    expect(get).toHaveBeenCalledWith("/admin/catalog/featured");
  });

  it("saves the whole list, in order, with PUT", async () => {
    put.mockResolvedValueOnce({ items: [], total: 0 });
    await setFeaturedProducts(["b", "a"]);
    expect(put).toHaveBeenCalledWith("/admin/catalog/featured", { productIds: ["b", "a"] });
  });

  it("sends what the screen loaded as basedOn, so a stale save can be refused", async () => {
    put.mockResolvedValueOnce({ items: [], total: 0 });
    await setFeaturedProducts(["b", "a"], ["a", "b", "c"]);
    expect(put).toHaveBeenCalledWith("/admin/catalog/featured", {
      productIds: ["b", "a"],
      basedOn: ["a", "b", "c"],
    });
  });

  it("lets the stale-list refusal (409) reach the screen with its sentence", async () => {
    put.mockRejectedValueOnce(new ApiError(409, "CONFLICT", "“Cedar” was featured after you opened this list."));
    await expect(setFeaturedProducts(["a"], ["a"])).rejects.toMatchObject({
      status: 409,
      message: expect.stringContaining("Cedar"),
    });
  });

  it("lets the server's refusal reach the screen instead of swallowing it", async () => {
    put.mockRejectedValueOnce(new ApiError(400, "BAD_REQUEST", "No listing exists with the id nope."));
    await expect(setFeaturedProducts(["nope"])).rejects.toThrow("No listing exists with the id nope.");
  });

  it("does not turn a failed read into an empty list", async () => {
    get.mockRejectedValueOnce(new ApiError(500, "INTERNAL", "boom"));
    await expect(getFeaturedProducts()).rejects.toThrow("boom");
  });
});

describe("mock mode", () => {
  // The mock mutates the shared fixture array, so put it back.
  let snapshot: { id: string; featured?: boolean; featuredRank?: number | null }[];

  beforeEach(() => {
    mockMode = true;
    snapshot = products.map((p) => ({ id: p.id, featured: p.featured, featuredRank: p.featuredRank }));
    for (const p of products) {
      p.featured = false;
      p.featuredRank = null;
    }
  });

  afterEach(() => {
    for (const saved of snapshot) {
      const product = products.find((p) => p.id === saved.id);
      if (product) {
        product.featured = saved.featured;
        product.featuredRank = saved.featuredRank;
      }
    }
  });

  const [a, b, c] = products;

  it("ranks by array position, starting at 1", async () => {
    const list = await setFeaturedProducts([c.id, a.id]);

    expect(list.items.map((p) => p.id)).toEqual([c.id, a.id]);
    expect(list.items.map((p) => p.featuredRank)).toEqual([1, 2]);
    expect(list.total).toBe(2);
    expect(products.find((p) => p.id === b.id)?.featured).toBe(false);
  });

  it("is a full replacement: a listing left out is unfeatured and loses its rank", async () => {
    await setFeaturedProducts([a.id, b.id, c.id]);
    const list = await setFeaturedProducts([b.id]);

    expect(list.items.map((p) => p.id)).toEqual([b.id]);
    expect(list.items[0].featuredRank).toBe(1);
    for (const gone of [a, c]) {
      const row = products.find((p) => p.id === gone.id);
      expect(row?.featured).toBe(false);
      expect(row?.featuredRank).toBeNull();
    }
  });

  it("collapses a duplicate to its first position", async () => {
    const list = await setFeaturedProducts([a.id, b.id, a.id]);
    expect(list.items.map((p) => p.id)).toEqual([a.id, b.id]);
    expect(list.items[1].featuredRank).toBe(2);
  });

  it("refuses an unknown id by name and changes nothing", async () => {
    await setFeaturedProducts([b.id]);

    await expect(setFeaturedProducts([a.id, "nope-not-a-listing"])).rejects.toThrow(
      /nope-not-a-listing/,
    );

    expect(products.find((p) => p.id === a.id)?.featured).toBe(false);
    expect(products.find((p) => p.id === b.id)?.featured).toBe(true);
  });

  it("refuses a list over the maximum rather than truncating it", async () => {
    const tooMany = Array.from({ length: MAX_FEATURED_PRODUCTS + 1 }, (_, i) => `x${i}`);
    await expect(setFeaturedProducts(tooMany)).rejects.toThrow(/at most 100/);
  });

  it("lists ranked listings first, then the unranked by rating — the order buyers get, not by name", async () => {
    a.featured = true; // unranked
    b.featured = true;
    b.featuredRank = 2;
    c.featured = true;
    c.featuredRank = 1;

    const list = await getFeaturedProducts();

    expect(list.items.map((p) => p.id)).toEqual([c.id, b.id, a.id]);
  });

  it("orders two unranked listings by rating, then review count", async () => {
    const original = [a, b, c].map((p) => ({ rating: p.rating, reviewCount: p.reviewCount }));
    try {
      a.featured = true;
      b.featured = true;
      c.featured = true;
      // Names would say a, b, c. Buyers get b (5.0), then c (4.0, more
      // reviews than a), then a (4.0).
      a.rating = 4;
      a.reviewCount = 3;
      b.rating = 5;
      b.reviewCount = 1;
      c.rating = 4;
      c.reviewCount = 9;

      const list = await getFeaturedProducts();

      expect(list.items.map((p) => p.id)).toEqual([b.id, c.id, a.id]);
    } finally {
      [a, b, c].forEach((p, i) => {
        p.rating = original[i].rating;
        p.reviewCount = original[i].reviewCount;
      });
    }
  });

  it("clears the rank when a listing is unfeatured through the moderation toggle", async () => {
    await setFeaturedProducts([a.id]);

    await moderateProduct(a.id, "unfeature");

    const row = products.find((p) => p.id === a.id);
    expect(row?.featured).toBe(false);
    expect(row?.featuredRank).toBeNull();
  });
});
