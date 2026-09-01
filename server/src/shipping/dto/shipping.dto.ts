import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { ConsignmentStatus } from '@prisma/client';

const STATUSES = Object.values(ConsignmentStatus);

export class ListConsignmentsQueryDto {
  @IsOptional()
  @IsIn(STATUSES)
  status?: ConsignmentStatus;

  @IsOptional()
  @IsString()
  page?: string;

  @IsOptional()
  @IsString()
  pageSize?: string;
}

/**
 * A cancellation needs a reason, and it is stored verbatim — the same rule
 * a moderation refusal follows (M22). "Cancelled" with no sentence is how
 * a HomeKrafter finds out a rider is not coming and cannot find out why.
 */
export class CancelConsignmentDto {
  @IsString()
  @MinLength(3)
  @MaxLength(300)
  reason!: string;
}

export class ServiceabilityQueryDto {
  @IsString()
  @MinLength(6)
  @MaxLength(6)
  pincode!: string;
}
