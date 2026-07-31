import { VendorPhotoKind } from '@prisma/client';
import { IsEnum, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

/**
 * A kitchen photo (M16). `url` is what `<PhotoUpload>` hands back from
 * `POST /uploads?purpose=storefront` — the URL, never the storage key,
 * per M14's rule.
 */
export class AddVendorPhotoDto {
  @IsString()
  @MaxLength(500)
  url!: string;

  @IsOptional() @IsString() @MaxLength(140) caption?: string;

  @IsOptional() @IsEnum(VendorPhotoKind) kind?: VendorPhotoKind;
}

export class ReorderVendorPhotosDto {
  /** Photo ids in the order they should appear. Ids not owned by the caller's vendor are ignored, not rejected — a stale tab reordering a deleted photo shouldn't 400 the whole save. */
  @IsString({ each: true })
  ids!: string[];
}

export class UpdateVendorPhotoDto {
  @IsOptional() @IsString() @MaxLength(140) caption?: string;
  @IsOptional() @IsEnum(VendorPhotoKind) kind?: VendorPhotoKind;
  @IsOptional() @IsInt() @Min(0) sortOrder?: number;
}
