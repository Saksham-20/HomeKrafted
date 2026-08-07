import { SellerSpecialty } from '@prisma/client';
import { IsEnum, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

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
