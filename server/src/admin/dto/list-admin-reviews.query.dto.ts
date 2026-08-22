import { IsInt, IsOptional, Max, Min } from 'class-validator';

/** Query for `GET /admin/catalog/reviews` — one page of the moderation list (M37). */
export class ListAdminReviewsQueryDto {
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
