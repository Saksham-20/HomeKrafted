import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

const KINDS = ['category', 'occasion'] as const;
const GROUPS = ['food', 'craft'] as const;

export class CreateTaxonomySuggestionDto {
  @IsIn(KINDS as unknown as string[])
  kind!: (typeof KINDS)[number];

  /**
   * Bounded at both ends for the same reason `businessName` is (M32): this
   * becomes a **shelf on the shopfront** the day an admin approves it, and
   * a one-character name or a pasted paragraph is not a category. The
   * limits check shape, never taste — "Achaar" is a fine suggestion and so
   * is one an admin will decline.
   */
  @IsString()
  @MinLength(2)
  @MaxLength(48)
  name!: string;

  /**
   * Which half of the catalogue a suggested **category** belongs to. The
   * form already knows — it is the "something to eat / something to keep"
   * answer — so it is sent rather than guessed at review time. Ignored for
   * an occasion, which has no side.
   */
  @IsOptional()
  @IsIn(GROUPS as unknown as string[])
  group?: (typeof GROUPS)[number];

  /** What they make, in their words. Optional: demanding an essay before accepting a two-word ask is how a queue stays empty. */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
