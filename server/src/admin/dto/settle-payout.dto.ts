import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class SettlePayoutDto {
  /**
   * The bank/UPI reference the transfer actually moved under (a UTR, a
   * transaction id). Optional because a first pass may be marking a batch
   * settled before the references are back — but it is the only link
   * between this row and a real transfer, so the UI asks for it.
   */
  @IsOptional()
  @IsString()
  @MaxLength(120)
  reference?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class RejectPayoutDto {
  /**
   * Required. A payout refused with no explanation is worse than one that
   * never happened — the HomeKrafter sees this string on their Payouts
   * screen and needs to know whether to fix something and re-request.
   */
  @IsString()
  @MinLength(5)
  @MaxLength(500)
  note!: string;
}
