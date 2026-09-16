import { IsNumber, IsString, Matches, Min } from 'class-validator';

/**
 * `POST /rider/cash/deposits` — D10's v1: a rider pays the company UPI ID
 * out of band and self-reports the UTR. `utr` is a UPI RRN — always
 * exactly 12 digits — and unique on `RiderDeposit` (schema-level), so a
 * duplicate submission (the same payment claimed twice, or a genuine
 * retry) surfaces as a 409 naming that.
 */
export class CreateDepositDto {
  @IsNumber()
  @Min(0.01)
  amount!: number;

  @IsString()
  @Matches(/^\d{12}$/, { message: 'A UPI UTR (RRN) is exactly 12 digits.' })
  utr!: string;
}
