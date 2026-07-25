import type { Snack, SnackList } from "@/lib/types";
import {
  getSnackBySlug,
  sampleSnackList,
  snackCategoryFilters,
  snacks,
  type SnackCategoryFilter,
} from "@/lib/data";

export type { SnackCategoryFilter };

export async function getSnacks(): Promise<Snack[]> {
  return snacks;
}

export async function getSnack(slug: string): Promise<Snack | undefined> {
  return getSnackBySlug(slug);
}

/** Category filter chips ("All" + the 4 `SnackCategory` values) for the Snacks grid. */
export async function getSnackCategoryFilters(): Promise<SnackCategoryFilter[]> {
  return snackCategoryFilters;
}

/** Sample in-progress snack list, for prototyping the sticky basket UI. */
export async function getSnackList(): Promise<SnackList> {
  return sampleSnackList;
}
