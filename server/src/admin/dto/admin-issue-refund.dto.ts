import { IsIn, IsNumber, IsOptional, IsPositive, IsString, MinLength } from 'class-validator';

/**
 * `POST /admin/wallet/:userId/refund` — a standalone wallet-credit refund
 * not necessarily tied to an `Order` (for that, use
 * `POST /admin/orders/marketplace/:id/refund`, which reads the amount off
 * the order itself rather than trusting a caller-supplied figure). This
 * one accepts an admin-declared `amount` by design (same money-safety
 * exception as `AdjustWalletDto` — gated `@Roles('admin')`, human in the
 * loop) — e.g. a support case where the linked order/booking was
 * cancelled outside the normal flow.
 */
export class AdminIssueRefundDto {
  @IsNumber()
  @IsPositive()
  amount!: number;

  @IsString()
  @MinLength(3)
  title!: string;

  @IsOptional()
  @IsIn(['order', 'laundryBooking', 'topup', 'referral', 'loyalty', 'support'])
  refType?: 'order' | 'laundryBooking' | 'topup' | 'referral' | 'loyalty' | 'support';

  @IsOptional()
  @IsString()
  refId?: string;
}
