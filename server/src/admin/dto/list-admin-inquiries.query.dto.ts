import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

/**
 * Paging for `GET /admin/corporate-inquiries`.
 *
 * `status` is declared here even though the controller reads it through
 * its own `@Query('status')` and validates it against `CorporateInquiryStatus`: the
 * global pipe runs with `forbidNonWhitelisted`, so a DTO on a `@Query()`
 * validates **every** key in the query string, and omitting `status` would
 * make filtering the queue return 400.
 */
export class ListAdminInquiriesQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(32)
  status?: string;

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
