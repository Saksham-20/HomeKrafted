import { IsIn, IsNumber, IsPositive, IsString, MinLength } from 'class-validator';

/**
 * `POST /admin/wallet/:userId/adjust` — same shape as `WalletService`'s
 * existing `AdjustWalletDto` minus `userId` (that comes from the route
 * param here, not the body, so there's no route/body mismatch to
 * validate). `AdminWalletService.adjust` forwards straight into
 * `WalletService.adjust` — no separate balance write.
 */
export class AdminAdjustWalletDto {
  @IsIn(['credit', 'debit'])
  direction!: 'credit' | 'debit';

  @IsNumber()
  @IsPositive()
  amount!: number;

  @IsString()
  @MinLength(3)
  reason!: string;
}
