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

export async function getCategories(): Promise<Category[]> {
  return categories;
}

export async function getCategory(slug: string): Promise<Category | undefined> {
  return getCategoryBySlug(slug);
}

export async function getCategoryById(id: string): Promise<Category | undefined> {
  return getCategoryByIdData(id);
}

export async function getOccasions(): Promise<Occasion[]> {
  return occasions;
}

export async function getOccasion(slug: string): Promise<Occasion | undefined> {
  return getOccasionBySlug(slug);
}

export async function getCollections(): Promise<Collection[]> {
  return collections;
}

export async function getCollection(slug: string): Promise<Collection | undefined> {
  return getCollectionBySlug(slug);
}

/** Curated collection for an occasion, if one exists — falls back to a plain product filter when absent. */
export async function getCollectionByOccasion(
  occasionId: string,
): Promise<Collection | undefined> {
  return getCollectionByOccasionIdData(occasionId);
}
