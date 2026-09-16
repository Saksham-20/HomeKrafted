import { IsNumber, IsString, MaxLength, MinLength, NotEquals } from 'class-validator';

/**
 * `PUT /admin/riders/:id/cash-adjustment` — the escape hatch for fixing a
 * mistake in the ledger (a wrongly-recorded `cod_collected`, a deposit
 * verified for the wrong rider, ...). `amount` is signed — a positive
 * value adds to what the rider owes, a negative one reduces it — and a
 * `note` is required for the same reason every refusal in this codebase
 * carries a sentence: this is the one write to the ledger that isn't
 * self-explanatory from its own type, so it has to explain itself.
 */
export class CashAdjustmentDto {
  @IsNumber()
  @NotEquals(0)
  amount!: number;

  @IsString()
  @MinLength(1)
  @MaxLength(500)
  note!: string;
}
