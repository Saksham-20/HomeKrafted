import { IsString, MaxLength, MinLength } from 'class-validator';

export class ReturnOrderDto {
  /**
   * Required, unlike a cancellation's. A return is a claim about food
   * that already arrived — whoever reviews it (and the HomeKrafter it
   * reflects on) needs to know what went wrong, and "refund requested"
   * with no words attached is unactionable.
   */
  @IsString()
  @MinLength(10)
  @MaxLength(1000)
  reason!: string;
}
