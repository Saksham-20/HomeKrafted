import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CancelOrderDto {
  /**
   * Optional, unlike a return's. Someone cancelling a minute after
   * checkout usually just changed their mind, and demanding a
   * justification to undo something nothing has happened to yet is
   * friction for its own sake.
   */
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason?: string;
}
