import { IsArray, IsOptional, IsString, MinLength } from 'class-validator';

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
  title!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  occasionId?: string;

  @IsArray()
  @IsString({ each: true })
  productIds!: string[];
}
