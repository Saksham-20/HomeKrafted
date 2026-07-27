import { IsIn, IsNumber, IsOptional, IsPositive, IsString } from 'class-validator';

/**
 * `orderId` (required when `purpose: "order"`) and `amount` (required when
 * `purpose: "topup"`) are cross-validated in `PaymentsService.createOrder`,
 * not here — class-validator's conditional decorators read awkwardly for a
 * two-way XOR and the service already owns "read the real order total from
 * the DB, never the client" for the `order` purpose anyway.
 */
export class CreateRazorpayOrderDto {
  @IsIn(['order', 'topup'])
  purpose!: 'order' | 'topup';

  /** Required for `purpose: "order"` — the Homekrafted `Order.id` to pay for. Its amount is always re-read from the DB row, never trusted from the client. */
  @IsOptional()
  @IsString()
  orderId?: string;

  /** Required for `purpose: "topup"` — the shopper's declared top-up amount. Safe to accept from the client: Razorpay only lets a payment capture against this exact order for this exact amount, and the wallet is only ever credited once the webhook independently verifies that capture (see `RazorpayOrderPurpose`'s doc comment in `schema.prisma`). */
  @IsOptional()
  @IsNumber()
  @IsPositive()
  amount?: number;
}
