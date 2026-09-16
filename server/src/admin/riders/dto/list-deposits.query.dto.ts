import { RiderDepositStatus } from '@prisma/client';
import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';

/** `GET /admin/rider-deposits?status&page`. Default filter is `pending` — the portal-kit rule: the queue opens on the filter with work in it. */
export class ListDepositsQueryDto {
  @IsOptional() @IsEnum(RiderDepositStatus) status?: RiderDepositStatus;
  @IsOptional() @IsInt() @Min(1) page?: number;
  @IsOptional() @IsInt() @Min(1) @Max(100) pageSize?: number;
}
