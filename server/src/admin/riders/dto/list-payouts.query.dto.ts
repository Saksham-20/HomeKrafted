import { RiderPayoutStatus } from '@prisma/client';
import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';

/** `GET /admin/rider-payouts?status&page`. Default filter is `pending` — same portal-kit rule as the deposit queue. */
export class ListPayoutsQueryDto {
  @IsOptional() @IsEnum(RiderPayoutStatus) status?: RiderPayoutStatus;
  @IsOptional() @IsInt() @Min(1) page?: number;
  @IsOptional() @IsInt() @Min(1) @Max(100) pageSize?: number;
}
