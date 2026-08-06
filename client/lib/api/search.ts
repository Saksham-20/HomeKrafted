import type { Product, Snack, Vendor } from "@/lib/types";
import { products, snacks, vendors } from "@/lib/data";
import { http, isMockMode } from "./http";

/**
 * Site search.
 *
 * Deliberately *not* a `/search` endpoint on the server: the three things
 * a shopper searches for already have list endpoints with the right
 * visibility rules baked in (`/products` hides moderated-out and
 * paused items and applies the delivery-radius filter, `/snacks` the
 * same, `/vendors` is public). A fan-out here reuses all of that, and
 * keeps a fourth copy of "what is a buyer allowed to see" from existing.
 * The three calls run in parallel from a Server Component, so it is one
 * round trip's worth of latency, not three.
 *
 * Scope note: laundry services are excluded on purpose. There are a
 * handful of them, they live on one page, and a search result reading
 * "Wash & Fold" that jumps into a booking wizard is a worse answer than
 * the Laundry nav link the visitor already has.
 */

export interface SearchResults {
  query: string;
  products: Product[];
  vendors: Vendor[];
  snacks: Snack[];
  /** Every section's length added up — what "12 results" in the heading counts. */
  total: number;
}

/** Terms all have to match somewhere on the row — mirrors the server's AND-across-terms rule so mock mode ranks the same way. */
function matchesAll(haystacks: (string | undefined)[], terms: string[]): boolean {
  const hay = haystacks.filter(Boolean).join(" ").toLowerCase();
  return terms.every((term) => hay.includes(term));
}

export async function search(
  query: string,
  near?: { lat: number; lng: number },
): Promise<SearchResults> {
  const q = query.trim();
  if (!q) return { query: "", products: [], vendors: [], snacks: [], total: 0 };

  if (isMockMode()) {
    const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
    const vendorNameById = new Map(vendors.map((v) => [v.id, v.name]));
    const productHits = products.filter(
      (p) =>
        // Allowlist (M22) — see `lib/api/products.ts#isBrowsable`.
        (p.moderationStatus ?? "active") === "active" &&
        matchesAll([p.name, p.description, vendorNameById.get(p.vendorId)], terms),
    );
    const vendorHits = vendors.filter((v) => matchesAll([v.name, v.bio, v.area], terms));
    const snackHits = snacks.filter((s) => matchesAll([s.name, s.description], terms));
    return {
      query: q,
      products: productHits,
      vendors: vendorHits,
      snacks: snackHits,
      total: productHits.length + vendorHits.length + snackHits.length,
    };
  }

  const nearQuery = near ? { lat: near.lat, lng: near.lng } : {};
  const [productPage, vendorHits, snackHits] = await Promise.all([
    http.get<{ items: Product[]; total: number }>("/products", {
      auth: false,
      query: { q, pageSize: 100, ...nearQuery },
    }),
    http.get<Vendor[]>("/vendors", { auth: false, query: { q } }),
    http.get<Snack[]>("/snacks", { auth: false, query: { q, ...nearQuery } }),
  ]);

  return {
    query: q,
    products: productPage.items,
    vendors: vendorHits,
    snacks: snackHits,
    total: productPage.items.length + vendorHits.length + snackHits.length,
  };
}
