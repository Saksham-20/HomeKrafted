import { IsISO8601, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class ApproveTaxonomySuggestionDto {
  /**
   * The name the real row gets, when the admin wants to tidy the ask —
   * "achaar" arriving as "Pickles & Preserves". Absent means "as asked".
   *
   * This is the whole reason approval is a human step: the person who can
   * see the entire list is the one who can tell a genuine gap from a
   * synonym, and rename it into the vocabulary that already exists.
   */
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(48)
  name?: string;

  /**
   * Categories only (M58) — the shelf the new subcategory lands under.
   *
   * Absent means "as asked", so an admin who just presses Approve honours
   * what the HomeKrafter chose. Pass `null` to promote a requested
   * subcategory to a top-level shelf, which is the other half of the same
   * judgement the rename above exists for.
   */
  @IsOptional()
  @IsString()
  parentCategoryId?: string | null;

  /** Occasions only — the absolute date it next falls on. Never a recurrence rule (CLAUDE.md, M16). */
  @IsOptional()
  @IsISO8601()
  celebratedOn?: string;

  /** Occasions only. */
  @IsOptional()
  @IsString()
  @MaxLength(160)
  tagline?: string;
}

export class RejectTaxonomySuggestionDto {
  /**
   * Required, and long enough to be actionable — the M22 rule. It reaches
   * the HomeKrafter **verbatim**, and it is the only thing telling them
   * whether to pick an existing shelf or ask again differently.
   */
  @IsString()
  @MinLength(10)
  @MaxLength(500)
  reason!: string;
}
