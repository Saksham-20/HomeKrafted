import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

/**
 * Query for `GET /admin/support/tickets`.
 *
 * `status` is declared here as a plain string and still translated by the
 * controller's `toDbStatus`, which owns the frontend spelling
 * (`in-progress`) and rejects an unknown value with a 400.
 *
 * It cannot simply stay a separate `@Query('status')` param: the global
 * pipe runs with `forbidNonWhitelisted`, so validating the query object
 * against a DTO that does not declare `status` **rejects the whole
 * request** — filtering the queue by status started returning 400 the
 * moment paging was added. A DTO here validates every key in the query
 * string, not only the ones it cares about.
 */
export class ListAdminSupportQueryDto {
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
