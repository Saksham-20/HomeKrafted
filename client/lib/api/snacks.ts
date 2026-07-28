import type { Snack, SnackList } from "@/lib/types";
import {
  getSnackBySlug,
  sampleSnackList,
  snackCategoryFilters,
  snacks,
  type SnackCategoryFilter,
} from "@/lib/data";
import { http, isMockMode } from "./http";

export type { SnackCategoryFilter };

/** Snacks (M8.4a — real menu reads). `GET /snacks`/`GET /snacks/:slug` are `@Public()` (`docs/API.md` "Services (M8.3a)") — ordering stays WhatsApp-only (`lib/channel.ts`), no cart/checkout endpoint exists for Snacks. */

export async function getSnacks(): Promise<Snack[]> {
  if (isMockMode()) return snacks;
  return http.get<Snack[]>("/snacks", { auth: false });
}

export async function getSnack(slug: string): Promise<Snack | undefined> {
  if (isMockMode()) return getSnackBySlug(slug);
  try {
    return await http.get<Snack>(`/snacks/${encodeURIComponent(slug)}`, { auth: false });
  } catch {
    return undefined;
  }
}

/** Category filter chips ("All" + the 4 `SnackCategory` values) for the Snacks grid — static client-side content, not an endpoint. */
export async function getSnackCategoryFilters(): Promise<SnackCategoryFilter[]> {
  return snackCategoryFilters;
}

/** Sample in-progress snack list, for prototyping the sticky basket UI — a `SnackList` never becomes a server-side entity (formats a `wa.me` message client-side). */
export async function getSnackList(): Promise<SnackList> {
  return sampleSnackList;
}
