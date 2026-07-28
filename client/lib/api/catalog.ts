import type { Category, Collection, Occasion } from "@/lib/types";
import {
  categories,
  collections,
  getCategoryById as getCategoryByIdData,
  getCategoryBySlug,
  getCollectionByOccasionId as getCollectionByOccasionIdData,
  getCollectionBySlug,
  getOccasionBySlug,
  occasions,
} from "@/lib/data";
import { http, isMockMode } from "./http";

/** Categories/occasions/collections (M8.4a — real). All `@Public()` (`docs/API.md` "Commerce (M8.1)"). */

export async function getCategories(): Promise<Category[]> {
  if (isMockMode()) return categories;
  return http.get<Category[]>("/categories", { auth: false });
}

export async function getCategory(slug: string): Promise<Category | undefined> {
  if (isMockMode()) return getCategoryBySlug(slug);
  try {
    return await http.get<Category>(`/categories/${encodeURIComponent(slug)}`, { auth: false });
  } catch {
    return undefined;
  }
}

/** No by-id endpoint — resolves from the full category list. */
export async function getCategoryById(id: string): Promise<Category | undefined> {
  if (isMockMode()) return getCategoryByIdData(id);
  const all = await getCategories();
  return all.find((c) => c.id === id);
}

export async function getOccasions(): Promise<Occasion[]> {
  if (isMockMode()) return occasions;
  return http.get<Occasion[]>("/occasions", { auth: false });
}

export async function getOccasion(slug: string): Promise<Occasion | undefined> {
  if (isMockMode()) return getOccasionBySlug(slug);
  try {
    return await http.get<Occasion>(`/occasions/${encodeURIComponent(slug)}`, { auth: false });
  } catch {
    return undefined;
  }
}

export async function getCollections(): Promise<Collection[]> {
  if (isMockMode()) return collections;
  return http.get<Collection[]>("/collections", { auth: false });
}

export async function getCollection(slug: string): Promise<Collection | undefined> {
  if (isMockMode()) return getCollectionBySlug(slug);
  try {
    return await http.get<Collection>(`/collections/${encodeURIComponent(slug)}`, { auth: false });
  } catch {
    return undefined;
  }
}

/** Curated collection for an occasion, if one exists — falls back to a plain product filter when absent. No dedicated endpoint; resolves from the full collections list. */
export async function getCollectionByOccasion(
  occasionId: string,
): Promise<Collection | undefined> {
  if (isMockMode()) return getCollectionByOccasionIdData(occasionId);
  const all = await getCollections();
  return all.find((c) => c.occasionId === occasionId);
}
