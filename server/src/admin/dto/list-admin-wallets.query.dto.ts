import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

/**
 * Query for both `GET /admin/wallet` (the per-user balance list, offset
 * paged) and `GET /admin/wallet/:userId` (one ledger, cursor paged).
 *
 * One DTO for both because the global pipe runs with
 * `forbidNonWhitelisted`: a DTO on a `@Query()` validates *every* key in
 * the query string, so a second DTO that omitted the other's fields would
 * turn a valid request into a 400.
 */
export class ListAdminWalletsQueryDto {
  /** Balance-list paging. */
  @IsOptional()
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;

  /** Ledger paging — rows per page, capped so it cannot ask for everything. */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  /** The `nextCursor` from the previous ledger page — a `WalletTransaction.id`. */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  cursor?: string;
}
