import { TaxonomySuggestion, Vendor, User } from '@prisma/client';

export type SuggestionRow = TaxonomySuggestion & {
  vendor?: Pick<Vendor, 'id' | 'name'> | null;
  suggestedBy?: Pick<User, 'id' | 'name'> | null;
};

/**
 * The wire shape of one suggestion.
 *
 * `suggestedByName` and `vendorName` are on the payload rather than left
 * as ids because the only screen that lists these is the admin queue, and
 * an operator deciding whether "Achaar" is a real gap needs to know which
 * kitchen is asking. The HomeKrafter's own list gets the same shape — the
 * extra two fields are their own name, which costs nothing.
 */
export function mapTaxonomySuggestion(row: SuggestionRow) {
  return {
    id: row.id,
    kind: row.kind,
    name: row.name,
    group: row.group ?? undefined,
    note: row.note ?? undefined,
    status: row.status,
    suggestedById: row.suggestedById,
    suggestedByName: row.suggestedBy?.name ?? undefined,
    vendorId: row.vendorId ?? undefined,
    vendorName: row.vendor?.name ?? undefined,
    decisionNote: row.decisionNote ?? undefined,
    reviewedAt: row.reviewedAt?.toISOString(),
    resultCategoryId: row.resultCategoryId ?? undefined,
    resultOccasionId: row.resultOccasionId ?? undefined,
    createdAt: row.createdAt.toISOString(),
  };
}
