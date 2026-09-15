import { createHmac, timingSafeEqual } from 'crypto';

/**
 * Verifies a Razorpay webhook delivery: HMAC-SHA256 over the **raw**
 * request body bytes, keyed with `RAZORPAY_WEBHOOK_SECRET`, hex-encoded,
 * compared against the `X-Razorpay-Signature` header — Razorpay's
 * documented webhook verification scheme. Must run against the raw
 * pre-JSON-parse bytes (`req.rawBody`, wired via `NestFactory.create(...,
 * { rawBody: true })` in `main.ts`) — re-serializing the parsed body would
 * not byte-for-byte match what Razorpay actually signed (key order,
 * whitespace, number formatting can all differ).
 *
 * `timingSafeEqual` (constant-time) rather than `===`/`Buffer.equals` —
 * an early-exit string comparison leaks how many leading bytes matched
 * through response-time variance, a real (if narrow) side channel for
 * forging a signature by brute force.
 */
export function verifyRazorpaySignature(rawBody: Buffer, signature: string | undefined, secret: string): boolean {
  if (!signature || !secret) return false;

  const expectedHex = createHmac('sha256', secret).update(rawBody).digest('hex');
  const expected = Buffer.from(expectedHex, 'utf8');
  const given = Buffer.from(signature, 'utf8');

  if (expected.length !== given.length) return false;
  return timingSafeEqual(expected, given);
}

/**
 * Verifies the signature Checkout hands the browser on success:
 * HMAC-SHA256 of `razorpay_order_id + "|" + razorpay_payment_id`, keyed
 * with the **key secret** (not the webhook secret), hex-encoded. Razorpay's
 * documented Standard Checkout scheme. Constant-time, same reason as above.
 */
export function verifyCheckoutSignature(
  razorpayOrderId: string,
  razorpayPaymentId: string,
  signature: string | undefined,
  keySecret: string,
): boolean {
  if (!signature || !keySecret || !razorpayOrderId || !razorpayPaymentId) return false;

  const expectedHex = createHmac('sha256', keySecret).update(`${razorpayOrderId}|${razorpayPaymentId}`).digest('hex');
  const expected = Buffer.from(expectedHex, 'utf8');
  const given = Buffer.from(signature, 'utf8');

  if (expected.length !== given.length) return false;
  return timingSafeEqual(expected, given);
}
