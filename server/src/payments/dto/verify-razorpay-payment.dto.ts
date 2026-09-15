import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

/** The three values Razorpay Checkout's success handler hands the browser, sent on as-is. */
export class VerifyRazorpayPaymentDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  razorpay_order_id!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  razorpay_payment_id!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  razorpay_signature!: string;
}
