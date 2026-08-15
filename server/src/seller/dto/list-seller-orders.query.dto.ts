import { IsInt, IsOptional, Max, Min } from 'class-validator';

/** Query for `GET /seller/orders` — one page of the kitchen's own orders (M37). */
export class ListSellerOrdersQueryDto {
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
