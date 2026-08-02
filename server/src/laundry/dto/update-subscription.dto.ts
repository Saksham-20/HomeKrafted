import { IsIn, IsISO8601, IsOptional, IsString, MinLength } from 'class-validator';
import { BooleanField } from '../../common/decorators/boolean-field.decorator';

export class UpdateSubscriptionDto {
  @IsOptional()
  @BooleanField()
  active?: boolean;

  @IsOptional()
  @IsIn(['weekly', 'biweekly', 'monthly'])
  plan?: 'weekly' | 'biweekly' | 'monthly';

  @IsOptional()
  @IsString()
  @MinLength(1)
  slotDay?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  slotId?: string;

  @IsOptional()
  @IsISO8601()
  nextPickup?: string;
}
