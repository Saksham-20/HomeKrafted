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
