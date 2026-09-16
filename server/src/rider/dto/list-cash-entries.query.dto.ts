import { IsInt, IsOptional, Max, Min } from 'class-validator';

/** `GET /rider/cash?page&pageSize` — pages the `entries` list; `balance`/`limit`/`codBlocked`/`pendingDeposits`/`companyUpiId` are unaffected by paging. */
export class ListCashEntriesQueryDto {
  @IsOptional() @IsInt() @Min(1) page?: number;
  @IsOptional() @IsInt() @Min(1) @Max(100) pageSize?: number;
}
