import { IsOptional, IsString, Length } from 'class-validator';
import { BooleanField } from '../../common/decorators/boolean-field.decorator';

/** `POST /rider/jobs/:id/deliver` — the 4-digit code read out by the buyer, and whether cash actually changed hands on a COD job. */
export class DeliverJobDto {
  @IsString()
  @Length(4, 4)
  otp!: string;

  /**
   * Only meaningful on a COD job (`RiderJobsService` ignores it when
   * `codAmount` is null). `@BooleanField()`, not `@IsBoolean()` — the
   * M17 rule: a bare validator reads the string `"false"` as `true`,
   * which here would silently create a `RiderCashEntry` for cash that
   * was never collected.
   */
  @IsOptional()
  @BooleanField()
  cashCollected?: boolean;
}
