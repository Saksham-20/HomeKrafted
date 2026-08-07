import { IsArray, IsInt, IsOptional, IsString, MaxLength, Min, MinLength, ValidateIf } from 'class-validator';
import { Type } from 'class-transformer';
import { BooleanField } from '../../common/decorators/boolean-field.decorator';

/**
 * `POST /admin/collections` (create) / `PATCH /admin/collections/:id`
 * (edit) — mirrors `client/lib/api/admin.ts`'s `UpsertCollectionInput`.
 * `productIds` order is the collection's real display order
 * (`docs/DATA-MODEL.md`) — written as `CollectionProduct.sortOrder` on
 * every save (delete+recreate the join rows, same recipe
 * `SellerListingsService.update` uses for `weightOptions`/`occasionIds`).
 */
export class UpsertCollectionDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  occasionId?: string;

  @IsArray()
  @IsString({ each: true })
  productIds!: string[];

  // M16 (H8) — a collection is a browsable gift guide at
  // `/guides/[slug]` now, not only the curated ordering behind an
  // occasion page, so it needs its own art and its own running order.
  @IsOptional()
  @ValidateIf((_, value) => value !== '')
  @IsString()
  @MaxLength(1000)
  imageSrc?: string;

  /** What the occasion hub and the home rail promote. */
  @IsOptional()
  @BooleanField()
  featured?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sortOrder?: number;
}
