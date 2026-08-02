import { IsOptional } from 'class-validator';
import { BooleanField } from '../../common/decorators/boolean-field.decorator';

export class UpdateNotificationPreferenceDto {
  @IsOptional()
  @BooleanField()
  sms?: boolean;

  @IsOptional()
  @BooleanField()
  whatsapp?: boolean;

  @IsOptional()
  @BooleanField()
  email?: boolean;

  @IsOptional()
  @BooleanField()
  inapp?: boolean;
}
