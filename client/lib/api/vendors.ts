import type { Vendor, VendorAvailability, VendorProfile } from "@/lib/types";
import {
  getVendorById as getVendorByIdData,
  getVendorBySlug,
  getVendorProfileBySlug,
  vendors,
} from "@/lib/data";
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

/**
 * The rich profile (M16) — story, kitchen photos, policies, trust signals.
 * Its own request rather than part of `getVendor`, because that call
 * answers product cards and follow checks too and none of them need this.
 *
 * Returns `undefined` only when the vendor itself is gone; a HomeKrafter
 * who has filled in nothing still gets a fully-shaped empty profile from
 * the server, so the storefront never has to branch on "no profile".
 */
export async function getVendorProfile(slug: string): Promise<VendorProfile | undefined> {
  if (isMockMode()) return getVendorProfileBySlug(slug);
  try {
    return await http.get<VendorProfile>(`/vendors/${encodeURIComponent(slug)}/profile`, {
      auth: false,
    });
  } catch {
    return undefined;
  }
}

/**
 * When a kitchen can actually take an order (M16, M2) — prep time,
 * working days, days marked off. Feeds `<PreOrderPicker availability>`.
 *
 * Falls back to an empty availability rather than `undefined` on failure:
 * a picker with no availability behaves exactly as it did before M16
 * (rolling days, 90-minute lead), which is a working scheduler. Failing
 * closed here would mean a network blip stops a kitchen taking orders.
 */
export async function getVendorAvailability(slug: string): Promise<VendorAvailability> {
  if (isMockMode()) {
    return { vendorId: slug, prepTimeMins: 180, workingDays: [1, 2, 3, 4, 5, 6], blackouts: [] };
  }
  try {
    return await http.get<VendorAvailability>(
      `/vendors/${encodeURIComponent(slug)}/availability`,
      { auth: false },
    );
  } catch {
    return { vendorId: slug, prepTimeMins: 90, workingDays: [], blackouts: [] };
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
