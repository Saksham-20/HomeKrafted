import { IsOptional, IsString, MaxLength, MinLength, ValidateIf } from 'class-validator';

/** No `vendorId` field on purpose — the vendor being edited always comes from the resolved seller's own `vendorId`, never a client-supplied id (see `SellerService.updateStorefront`). */
export class UpdateStorefrontDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  bio?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  location?: string;

  /** Real project asset path (e.g. "/images/vendors/avatar.jpg") — no upload backend yet, same convention as the frontend mock's `SellerStorefrontInput`. */
  @IsOptional()
  @ValidateIf((_, value) => value !== '')
  @IsString()
  avatarSrc?: string;

  @IsOptional()
  @ValidateIf((_, value) => value !== '')
  @IsString()
  bannerSrc?: string;
}
