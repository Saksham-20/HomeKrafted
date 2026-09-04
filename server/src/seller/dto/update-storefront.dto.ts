import { IsOptional, IsString, MaxLength, MinLength, ValidateIf } from 'class-validator';

/** No `vendorId` field on purpose — the vendor being edited always comes from the resolved seller's own `vendorId`, never a client-supplied id (see `SellerService.updateStorefront`). */
export class UpdateStorefrontDto {
  /**
   * The storefront's name (M60).
   *
   * A kitchen changes what it is called — it registered under the owner's
   * own name and later wants "Pihu's Kitchen". It becomes `Vendor.name`
   * and `Seller.displayName` (kept in step in one transaction), so it is
   * on every product card and every order.
   *
   * **Two names may be identical.** Nothing here is unique and nothing is
   * made unique: two real kitchens can genuinely be called "Home Bakes",
   * and the account is told apart by its phone number and email, which
   * are. The `slug` is deliberately untouched by a rename — it is in every
   * storefront URL anybody has shared and everything Google has indexed
   * (the M58 category rule).
   *
   * Shape is checked by `checkBusinessName`, the same function `/sell`
   * uses, so a rename cannot land a value the application form would have
   * refused (an email address, a phone number, `Abc`).
   */
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name?: string;

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
