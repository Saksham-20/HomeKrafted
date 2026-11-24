import type { PaymentMethod } from "@/lib/types";

/**
 * How a way to pay reads on an order screen. The shopper's order page had
 * this map; the HomeKrafter's order and pickup pages printed the raw value
 * ("razorpay"). Admin keeps the raw value on purpose — it is what they
 * search for in the provider's dashboard.
 */
const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  wallet: "Paid from wallet",
  razorpay: "Card / UPI",
  cod: "Cash on delivery",
};

export function paymentMethodLabel(method: string): string {
  return PAYMENT_METHOD_LABEL[method as PaymentMethod] ?? method;
}
