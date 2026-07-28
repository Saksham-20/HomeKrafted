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
