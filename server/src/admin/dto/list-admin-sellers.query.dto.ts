import { SellerSpecialty } from '@prisma/client';
import { IsEnum, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

/** Query for `GET /admin/sellers`. */
export class ListAdminSellersQueryDto {
  /**
   * A single specialty tag. `Seller.specialties` is a list, so this is a
   * `has` rather than an equality — a HomeKrafter who bakes *and* pickles
   * appears under both, which is the point of the field.
   *
   * Still only a discovery/display filter, never an access decision
   * (`CLAUDE.md`, M12).
   */
  @IsOptional()
  @IsEnum(SellerSpecialty, { message: 'specialty must be a known SellerSpecialty' })
  specialty?: SellerSpecialty;

  /** Matches the HomeKrafter's display name or their storefront's name. */
  @IsOptional()
  @IsString()
  @MaxLength(120)
  q?: string;

  /**
   * Where this HomeKrafter is between "approved" and "actually using the
   * site" (M32).
   *
   * `awaiting` — issued sign-in details they have not used yet. This is
   * the queue that matters: an approved kitchen sitting here is one
   * nobody has finished onboarding, and it is invisible without a
   * filter.
   * `onboarded` — has chosen their own password.
   * `no_credentials` — approved before M32 (or since reset to nothing):
   * an account with no password at all, so no way in exists yet. This is
   * the most actionable list of the three.
   */
  @IsOptional()
  @IsIn(['awaiting', 'onboarded', 'no_credentials'])
  onboarding?: 'awaiting' | 'onboarded' | 'no_credentials';

  @IsOptional()
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;
}
