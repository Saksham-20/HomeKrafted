import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { TrimmedString } from '../../common/decorators/trimmed-string.decorator';

export class CreateSupportTicketDto {
  @TrimmedString(1, 200)
  subject!: string;

  @IsIn(['chat', 'call', 'email'])
  channel!: 'chat' | 'call' | 'email';

  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  message!: string;

  @IsOptional()
  @IsString()
  orderRef?: string;
}
