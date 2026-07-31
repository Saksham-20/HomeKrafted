import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

/**
 * What a HomeKrafter may write about themselves (M16).
 *
 * **The verification flags are absent by design.** `fssaiVerified`,
 * `identityVerified`, `addressVerified` and `verifiedAt` are the badge a
 * buyer trusts, and a seller setting their own badge would make it
 * meaningless. They live on the admin DTO
 * (`SetVerificationDto`) and nowhere else — see
 * `SellerProfileService.updateOwn`, which builds its Prisma payload
 * field-by-field rather than spreading this object, so a field added here
 * can never accidentally reach a column it shouldn't.
 *
 * `fssaiNumber` *is* here: submitting a licence is the seller's job,
 * checking it is ours. Submitting one clears any existing verification —
 * a changed number has not been checked.
 */
export class UpdateSellerProfileDto {
  @IsOptional() @IsString() @MaxLength(120) tagline?: string;
  @IsOptional() @IsString() @MaxLength(4000) story?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(12)
  @IsString({ each: true })
  @MaxLength(60, { each: true })
  knownFor?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  @MaxLength(40, { each: true })
  languages?: string[];

  /** A home kitchen that needs more than a week of notice is not taking orders, it is taking commissions. */
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(10080) prepTimeMins?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(10080) responseTimeMins?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(1000) capacityPerDay?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(100000) minOrderValue?: number;

  /** 0 = Sunday, matching `Date.getDay()` so the client never needs a remap. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(7)
  @Type(() => Number)
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(6, { each: true })
  workingDays?: number[];

  @IsOptional() @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, { message: 'opensAt must be HH:MM' }) opensAt?: string;
  @IsOptional() @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, { message: 'closesAt must be HH:MM' }) closesAt?: string;

  @IsOptional() @IsString() @MaxLength(1000) cancellationPolicy?: string;
  @IsOptional() @IsString() @MaxLength(1000) returnPolicy?: string;
  @IsOptional() @IsString() @MaxLength(1000) customOrderPolicy?: string;
  @IsOptional() @IsBoolean() acceptsCustomOrders?: boolean;
  @IsOptional() @IsString() @MaxLength(1000) packagingNote?: string;
  @IsOptional() @IsString() @MaxLength(1000) hygieneNote?: string;

  /** 14 digits, the FSSAI format. Validated for shape only — whether it is *this* kitchen's licence is what the admin check is for. */
  @IsOptional() @Matches(/^\d{14}$/, { message: 'An FSSAI licence number is 14 digits' }) fssaiNumber?: string;

  @IsOptional() @IsUrl() @MaxLength(300) instagramUrl?: string;
  @IsOptional() @IsUrl() @MaxLength(300) facebookUrl?: string;
  @IsOptional() @IsUrl() @MaxLength(300) youtubeUrl?: string;
  @IsOptional() @IsUrl() @MaxLength(300) websiteUrl?: string;
}
