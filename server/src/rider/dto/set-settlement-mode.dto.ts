import { CashSettlementMode } from '@prisma/client';
import { IsEnum } from 'class-validator';

/** `PUT /rider/settlement-mode` — D9's two choices, see `cash-ledger.ts#deductionFor` for what each means at payout time. */
export class SetSettlementModeDto {
  @IsEnum(CashSettlementMode)
  mode!: CashSettlementMode;
}
