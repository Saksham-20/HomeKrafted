import { ProductModerationStatus } from '@prisma/client';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

const MODERATION_STATUSES: ProductModerationStatus[] = [
  'pending',
  'active',
  'rejected',
  'hidden',
  'flagged',
];

/**
 * `featured` is not a `ProductModerationStatus` — it is a merchandising
 * flag that sits alongside one (`CLAUDE.md`, M22: feature/unfeature must
 * never touch moderation state). The admin screen has always offered it in
 * the same chip row because it is the same question to a person — "show me
 * the listings in state X" — so it is accepted here and translated to a
 * different column rather than being pushed into the enum.
 */
export const CATALOG_FILTERS = [...MODERATION_STATUSES, 'featured'] as const;
export type CatalogFilter = (typeof CATALOG_FILTERS)[number];

/** Query for `GET /admin/catalog/products`. */
export class ListAdminCatalogQueryDto {
  @IsOptional()
  @IsIn(CATALOG_FILTERS, { message: `status must be one of ${CATALOG_FILTERS.join(', ')}` })
  status?: CatalogFilter;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  vendorId?: string;

  /** Matches the listing's name, its kitchen's name, or its category. */
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
