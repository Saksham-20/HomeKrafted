import { IsISO8601, IsOptional } from 'class-validator';

/** `GET /rider/earnings?from&to` — both optional; an absent bound is unbounded on that side (`RiderCashService` defaults `to` to now and leaves `from` open when unset). */
export class ListEarningsQueryDto {
  @IsOptional() @IsISO8601() from?: string;
  @IsOptional() @IsISO8601() to?: string;
}
