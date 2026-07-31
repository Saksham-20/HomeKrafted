import { IsIn, IsString, MaxLength, MinLength } from 'class-validator';

export class SupportReplyDto {
  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  body!: string;
}

export class SetTicketStatusDto {
  /**
   * The hyphenated frontend form (`client/lib/types/shared.ts`
   * `SupportTicketStatus`); the service maps it onto the Prisma enum
   * member, which can't contain a hyphen.
   */
  @IsIn(['open', 'in-progress', 'resolved', 'closed'])
  status!: 'open' | 'in-progress' | 'resolved' | 'closed';
}
