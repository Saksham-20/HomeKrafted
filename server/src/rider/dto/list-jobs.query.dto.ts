import { IsInt, IsOptional, Max, Min } from 'class-validator';

/** `GET /rider/jobs?page` — a rider's own history, paged. */
export class ListJobsQueryDto {
  @IsOptional() @IsInt() @Min(1) page?: number;
  @IsOptional() @IsInt() @Min(1) @Max(100) pageSize?: number;
}
