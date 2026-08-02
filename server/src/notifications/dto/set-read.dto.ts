import { IsOptional } from 'class-validator';
import { BooleanField } from '../../common/decorators/boolean-field.decorator';

export class SetReadDto {
  @IsOptional()
  @BooleanField()
  read?: boolean;
}
