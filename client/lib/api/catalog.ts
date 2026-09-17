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

/**
 * Unfiltered by id — resolves an archived or merged category too (the
 * product-page breadcrumb reads a listing's `categoryId` this way), unlike
 * `getCategories()`, which is the browse/picker list and drops both.
 */
export async function getCategoryById(id: string): Promise<Category | undefined> {
  if (isMockMode()) return getCategoryByIdData(id);
  try {
    return await http.get<Category>(`/categories/id/${encodeURIComponent(id)}`, { auth: false });
  } catch {
    return undefined;
  }
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

// ---------------------------------------------------------------------------
// The gift taxonomy's browse data (G1 §5.4 / G3)
// ---------------------------------------------------------------------------

export interface DepartmentChild {
  id: string;
  slug: string;
  name: string;
  icon: string | null;
  count: number;
}

export interface Department {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  icon: string | null;
  count: number;
  /** A real listing's photograph, chosen server-side. Never stock or generated. */
  imageSrc: string | null;
  children: DepartmentChild[];
}

export interface FacetOption {
  value: string;
  label: string;
  hex: string | null;
  count: number;
}

export interface Facet {
  key: string;
  label: string;
  kind: string;
  unit: string | null;
  /**
   * How many listings in view never answered this question.
   *
   * Rendered, not hidden: a buyer cannot otherwise tell "none match" from
   * "nobody was asked", and absence is not an answer.
   */
  unanswered: number;
  answered: number;
  options: FacetOption[];
}

export interface FacetsResponse {
  total: number;
  facets: Facet[];
}

/**
 * The department tiles for a browse page.
 *
 * Only departments with something live come back (D2), each faced with a
 * real listing's photograph and carrying its non-empty subcategories — so
 * the page never draws a tile that cannot be pressed, and never invents an
 * image for one.
 */
export async function getDepartments(kind: "craft" | "food" = "craft"): Promise<Department[]> {
  if (isMockMode()) return mockDepartments(kind);
  return http.get<Department[]>(`/catalog/departments?kind=${kind}`, { auth: false });
}

/**
 * Counts for the current selection.
 *
 * `query` is **the same query string `GET /products` takes** — that is the
 * point of the endpoint. A facet count computed from a different filter
 * than the grid is a number that disagrees with the page under it, and
 * nobody looking at the two can tell which is lying.
 */
export async function getFacets(query = ""): Promise<FacetsResponse> {
  if (isMockMode()) return { total: 0, facets: [] };
  const suffix = query ? `&${query.replace(/^[?&]/, "")}` : "";
  return http.get<FacetsResponse>(`/catalog/facets?kind=craft${suffix}`, { auth: false });
}

/**
 * Mock mode derives the tree from the fixtures rather than answering empty.
 *
 * Local dev runs with `NEXT_PUBLIC_USE_MOCK=true`, so a browse page that
 * renders no departments offline looks broken to the only people who can
 * test it. It carries no photograph, because the mock catalogue's images
 * belong to listings and picking one here would be inventing a face.
 */
function mockDepartments(kind: "craft" | "food"): Department[] {
  const parents = categories.filter((category) => !category.parentId && category.group === kind);
  return parents
    .map((parent) => {
      const children = categories
        .filter((category) => category.parentId === parent.id)
        .map((child) => ({
          id: child.id,
          slug: child.slug,
          name: child.name,
          icon: child.icon ?? null,
          count: 1,
        }));
      return {
        id: parent.id,
        slug: parent.slug,
        name: parent.name,
        description: parent.description ?? null,
        icon: parent.icon ?? null,
        count: children.length + 1,
        imageSrc: null,
        children,
      };
    })
    .filter((department) => department.count > 0);
}
