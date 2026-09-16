import { DeliveryJobStatus } from '@prisma/client';
import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';

/** `GET /admin/deliveries?status&page`. */
export class ListDeliveriesQueryDto {
  @IsOptional() @IsEnum(DeliveryJobStatus) status?: DeliveryJobStatus;
  @IsOptional() @IsInt() @Min(1) page?: number;
  @IsOptional() @IsInt() @Min(1) @Max(100) pageSize?: number;
}
