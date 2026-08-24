import { http, isMockMode } from "./http";
import type {
  ProductKind,
  TaxonomyKind,
  TaxonomySuggestion,
  TaxonomySuggestionStatus,
} from "@/lib/types";

/**
 * Shelves and occasions people have asked for (M50).
 *
 * **Why an ask and not a create.** A HomeKrafter could not say "there is
 * no shelf for what I make" anywhere in the product: the picker's empty
 * state read *"Ask us to add it"* and there was nobody to ask. Letting
 * them add one outright is the thing
 * `server/test/unit/occasion-admin-only.spec.ts` exists to stop — these
 * two lists are a shared vocabulary the whole catalogue browses by, and
 * one anybody can append to stops being one. So the ask is recorded and
 * an admin mints the row.
 *
 * **Nothing here swallows a rejection** (the M36 rule). The server
 * refuses three of these on purpose — the name already exists, they have
 * already asked, the reason is too short — and each refusal carries the
 * sentence saying what to do instead. A `catch { return undefined }` here
 * would turn every one of them into a dead button.
 */

export interface CreateTaxonomySuggestionInput {
  kind: TaxonomyKind;
  name: string;
  /** Categories only — which half of the catalogue. Taken from the form's "eat or keep" answer. */
  group?: ProductKind;
  note?: string;
}

/** **Mock mode has no queue.** There is no in-memory suggestion store and inventing one would let the offline build report a success the real one refuses. */
function mockRefusal(): never {
  throw new Error(
    "Asking for a new shelf needs the real API — set NEXT_PUBLIC_USE_MOCK=false.",
  );
}

export async function createTaxonomySuggestion(
  input: CreateTaxonomySuggestionInput,
): Promise<TaxonomySuggestion> {
  if (isMockMode()) mockRefusal();
  return http.post<TaxonomySuggestion>("/seller/taxonomy-suggestions", input);
}

export async function getMyTaxonomySuggestions(): Promise<TaxonomySuggestion[]> {
  if (isMockMode()) return [];
  return http.get<TaxonomySuggestion[]>("/seller/taxonomy-suggestions");
}

export interface AdminTaxonomySuggestionPage {
  items: TaxonomySuggestion[];
  /**
   * Waiting across the whole queue, deliberately not narrowed by the
   * filter — the same rule as the catalogue's `pendingCount`. A badge
   * reading zero because the admin happens to be looking at "approved" is
   * worse than no badge, and there is a HomeKrafter waiting behind it.
   */
  pendingCount: number;
}

export async function getTaxonomySuggestions(
  status?: TaxonomySuggestionStatus,
): Promise<AdminTaxonomySuggestionPage> {
  if (isMockMode()) return { items: [], pendingCount: 0 };
  const query = status ? `?status=${status}` : "";
  return http.get<AdminTaxonomySuggestionPage>(`/admin/taxonomy-suggestions${query}`);
}

export interface ApproveTaxonomySuggestionInput {
  /** Rename on the way in — "achaar" filed as "Pickles & Preserves". Absent means "as asked". */
  name?: string;
  /** Occasions only. An absolute date, never a recurrence rule (CLAUDE.md, M16). */
  celebratedOn?: string;
  tagline?: string;
}

export async function approveTaxonomySuggestion(
  id: string,
  input: ApproveTaxonomySuggestionInput = {},
): Promise<TaxonomySuggestion> {
  if (isMockMode()) mockRefusal();
  return http.post<TaxonomySuggestion>(`/admin/taxonomy-suggestions/${id}/approve`, input);
}

export async function rejectTaxonomySuggestion(
  id: string,
  reason: string,
): Promise<TaxonomySuggestion> {
  if (isMockMode()) mockRefusal();
  return http.post<TaxonomySuggestion>(`/admin/taxonomy-suggestions/${id}/reject`, { reason });
}
