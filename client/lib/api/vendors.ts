import type { Vendor } from "@/lib/types";
import { getVendorById as getVendorByIdData, getVendorBySlug, vendors } from "@/lib/data";
import { http, isMockMode } from "./http";

/** Vendors (M8.4a — real). `GET /vendors`/`GET /vendors/:slug` are `@Public()` (`docs/API.md` "Commerce (M8.1)"). */

export async function getVendors(): Promise<Vendor[]> {
  if (isMockMode()) return vendors;
  return http.get<Vendor[]>("/vendors", { auth: false });
}

export async function getVendor(slug: string): Promise<Vendor | undefined> {
  if (isMockMode()) return getVendorBySlug(slug);
  try {
    return await http.get<Vendor>(`/vendors/${encodeURIComponent(slug)}`, { auth: false });
  } catch {
    return undefined;
  }
}

/** No by-id endpoint — resolves from the full vendor list. */
export async function getVendorById(id: string): Promise<Vendor | undefined> {
  if (isMockMode()) return getVendorByIdData(id);
  const all = await getVendors();
  return all.find((v) => v.id === id);
}

// ---------------------------------------------------------------------
// Follows (M15)
//
// `GET /vendors/:slug` is `@Public()`, and the API's global guard doesn't
// attach a session to a public route — so "am I following this
// storefront" can't ride along with the storefront itself and is its own
// authed read. That's why `<FollowButton>` fetches on mount rather than
// being handed a prop by the server page.
// ---------------------------------------------------------------------

export interface FollowState {
  following: boolean;
  followerCount: number;
}

export async function getFollowState(slug: string): Promise<FollowState> {
  if (isMockMode()) {
    const vendor = getVendorBySlug(slug);
    return { following: Boolean(vendor?.isFollowing), followerCount: vendor?.followerCount ?? 0 };
  }
  return http.get<FollowState>(`/vendors/${encodeURIComponent(slug)}/follow`);
}

export async function followVendor(slug: string): Promise<FollowState> {
  if (isMockMode()) {
    const vendor = getVendorBySlug(slug);
    return { following: true, followerCount: (vendor?.followerCount ?? 0) + 1 };
  }
  return http.post<FollowState>(`/vendors/${encodeURIComponent(slug)}/follow`, {});
}

export async function unfollowVendor(slug: string): Promise<FollowState> {
  if (isMockMode()) {
    const vendor = getVendorBySlug(slug);
    return { following: false, followerCount: Math.max(0, (vendor?.followerCount ?? 1) - 1) };
  }
  return http.delete<FollowState>(`/vendors/${encodeURIComponent(slug)}/follow`);
}

/** Storefronts the signed-in buyer follows — `/account/following`. */
export async function getFollowedVendors(): Promise<Vendor[]> {
  if (isMockMode()) return vendors.filter((v) => v.isFollowing);
  return http.get<Vendor[]>("/vendors/following");
}
