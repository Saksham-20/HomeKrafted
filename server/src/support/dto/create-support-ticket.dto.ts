import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateSupportTicketDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
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
