import { ArrayMaxSize, IsArray, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * The most listings an admin may feature at once.
 *
 * Not a taste limit on the buyer side (the default browse leads with
 * however many are featured) but a bound on the write: the whole list is
 * saved in one transaction and one audit row, and a "featured" set that
 * outgrows a screenful has stopped selecting anything. `PUT
 * /admin/catalog/featured` refuses a longer list rather than truncating it
 * — silently dropping the tail would unfeature listings the admin thought
 * they had kept.
 */
export const MAX_FEATURED = 100;

/**
 * `PUT /admin/catalog/featured` — the **complete** featured list, in
 * order.
 *
 * Array position is the rank (index 0 becomes `featuredRank` 1), the same
 * order-is-rank shape as `UpsertCollectionDto.productIds`. It is a full
 * replacement: a product that is featured today and absent from this list
 * is unfeatured, because a set that can only grow is not something an
 * admin can curate. An empty list is a real answer — "feature nothing".
 */
export class SetFeaturedDto {
  @IsArray()
  @ArrayMaxSize(MAX_FEATURED, {
    message: `Feature at most ${MAX_FEATURED} listings — beyond that nothing is being singled out`,
  })
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  @MaxLength(64, { each: true })
  productIds!: string[];

  /**
   * The featured ids the admin's screen loaded, so a save from a stale list
   * can be refused instead of silently unfeaturing a listing another admin
   * featured in the meantime (`AdminCatalogService.setFeatured`). Optional:
   * omitted, the replacement is unconditional, as it was before this field.
   *
   * Capped well above `MAX_FEATURED` because it describes what was loaded,
   * not what is being saved — the Products tab's Feature button is not
   * capped, so a loaded set can be longer than a list may be saved as.
   */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(1000)
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  @MaxLength(64, { each: true })
  basedOn?: string[];
}
