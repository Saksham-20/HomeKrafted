import { RiderStatus } from '@prisma/client';
import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

/** `GET /admin/riders?status&zoneId&page`. Default filter is `under_review` — see `AdminRidersService.list`. */
export class ListRidersQueryDto {
  @IsOptional() @IsEnum(RiderStatus) status?: RiderStatus;
  @IsOptional() @IsString() zoneId?: string;

  @IsOptional() @IsInt() @Min(1) page?: number;
  @IsOptional() @IsInt() @Min(1) @Max(100) pageSize?: number;
}
