import { IsIn, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { BooleanField } from '../../common/decorators/boolean-field.decorator';

/** Partial patch — same "merge a partial update" shape as `WalletContext.setAutoTopup` in the mock. Every field optional; unset fields keep their current stored value (or a sane default when no rule row exists yet). */
export class SetAutoTopupDto {
  @IsOptional()
  @BooleanField()
  enabled?: boolean;

  @IsOptional()
  @IsIn(['below-threshold', 'scheduled'])
  trigger?: 'below-threshold' | 'scheduled';

  @IsOptional()
  @IsNumber()
  @Min(0)
  thresholdAmount?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  topupAmount?: number;

  @IsOptional()
  @IsString()
  paymentMethodRef?: string;
}
