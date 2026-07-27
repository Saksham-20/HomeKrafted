import { IsIn, IsNumber, IsPositive, IsString, MinLength } from 'class-validator';

/**
 * Admin manual wallet credit/debit (`WalletTransactionCategory.adjustment`)
 * — the one wallet mutation where accepting a caller-supplied `amount` is
 * correct rather than a money-safety hole, since it's gated `@Roles('admin')`
 * and exists specifically so a human can make a support case right. `reason`
 * is required and becomes part of the ledger row's `title` for audit.
 */
export class AdjustWalletDto {
  /** The consumer whose wallet is being adjusted — never the admin's own. */
  @IsString()
  @MinLength(1)
  userId!: string;

  @IsIn(['credit', 'debit'])
  direction!: 'credit' | 'debit';

  @IsNumber()
  @IsPositive()
  amount!: number;

  @IsString()
  @MinLength(3)
  reason!: string;
}
