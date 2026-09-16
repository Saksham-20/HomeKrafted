import { IsString, MinLength } from 'class-validator';

/**
 * G1 — approving one proposed move (docs/GIFTING-REWORK.md §3.5).
 *
 * One row at a time, deliberately: the screen's whole point is that a
 * person reads each proposal and the words it matched on. A "move
 * everything the rule suggested" button would be the automatic re-filing
 * this design exists to avoid.
 */
export class ApplyRecategorisationDto {
  @IsString()
  @MinLength(1)
  productId!: string;

  @IsString()
  @MinLength(1)
  categoryId!: string;
}
