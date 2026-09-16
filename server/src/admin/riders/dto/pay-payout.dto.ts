import { IsOptional, IsString, MaxLength } from 'class-validator';

/** `POST /admin/rider-payouts/:id/pay` — same "records a settlement, does not perform one" rule as `SettlePayoutDto` (M15). */
export class PayPayoutDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  reference?: string;
}
