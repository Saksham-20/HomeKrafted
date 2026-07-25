import type { Vendor } from "@/lib/types";
import { getVendorById as getVendorByIdData, getVendorBySlug, vendors } from "@/lib/data";

export async function getVendors(): Promise<Vendor[]> {
  return vendors;
}

export async function getVendor(slug: string): Promise<Vendor | undefined> {
  return getVendorBySlug(slug);
}

export async function getVendorById(id: string): Promise<Vendor | undefined> {
  return getVendorByIdData(id);
}
