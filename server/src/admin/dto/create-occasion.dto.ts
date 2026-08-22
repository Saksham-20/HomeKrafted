import { IsISO8601, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

/**
 * `POST /admin/collections/occasions` (M43) — adding a festival.
 *
 * **Creation is admin-only, and this route is where that is enforced.**
 * It sits under `/api/v1/admin`, which is the path `RolesGuard` treats as
 * fail-closed, and there is deliberately no `/seller/*` equivalent: a
 * HomeKrafter tags a listing with an occasion, they do not invent one.
 * A shared vocabulary that anybody can add to stops being a vocabulary —
 * "Diwali", "diwali " and "Deepavali" become three hub pages splitting
 * the same traffic between them. `server/test/unit/occasion-admin-only.spec.ts`
 * fails the build if a seller-facing route ever writes this table.
 *
 * `celebratedOn` stays optional, and its absence is a real answer rather
 * than an omission: a birthday has no season. The admin form says so
 * where the field is, so evergreen is chosen rather than fallen into.
 */
export class CreateOccasionDto {
  /**
   * The name a buyer reads. Shape only — "Onam" and "Beltane" are both
   * valid, and it is not this endpoint's business which festivals the
   * catalogue sells into.
   */
  @IsString()
  @MinLength(2)
  @MaxLength(60)
  @Matches(/[\p{L}\p{N}]/u, { message: 'Give the occasion a name.' })
  name!: string;

  @IsOptional()
  @IsISO8601()
  celebratedOn?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  tagline?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  imageSrc?: string;
}
