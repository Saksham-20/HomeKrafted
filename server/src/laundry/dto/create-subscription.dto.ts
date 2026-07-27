import { IsIn, IsISO8601, IsString, MinLength } from 'class-validator';

export class CreateSubscriptionDto {
  @IsString()
  @MinLength(1)
  serviceId!: string;

  @IsIn(['weekly', 'biweekly', 'monthly'])
  plan!: 'weekly' | 'biweekly' | 'monthly';

  @IsString()
  @MinLength(1)
  slotDay!: string;

  @IsString()
  @MinLength(1)
  slotId!: string;

  @IsISO8601()
  nextPickup!: string;
}
