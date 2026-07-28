import { createHmac, timingSafeEqual } from 'crypto';

/**
 * Verifies a Meta webhook delivery: HMAC-SHA256 over the **raw** request
 * body bytes, keyed with the Meta App Secret, hex-encoded, compared
 * against the `X-Hub-Signature-256: sha256=<hex>` header — Meta's
 * documented webhook payload-verification scheme (mirrors
 * `payments/razorpay-signature.util.ts`'s pattern for Razorpay's
 * `X-Razorpay-Signature`). Keyed with `WHATSAPP_APP_SECRET`, **not**
 * `WHATSAPP_VERIFY_TOKEN` — the verify token is only used for the
 * one-time `GET` subscription handshake; Meta signs every actual webhook
 * *delivery* with the app secret instead.
 *
 * Must run against the raw pre-JSON-parse bytes (`req.rawBody`, wired via
 * `NestFactory.create(..., { rawBody: true })` in `main.ts`) — a
 * re-serialization of the parsed body would not byte-for-byte match what
 * Meta actually signed.
 *
 * `timingSafeEqual` (constant-time) rather than `===` — an early-exit
 * string comparison leaks how many leading bytes matched through
 * response-time variance, a real (if narrow) side channel for forging a
 * signature by brute force.
 */
export function verifyMetaSignature(rawBody: Buffer, signatureHeader: string | undefined, appSecret: string): boolean {
  if (!signatureHeader || !appSecret) return false;

  const prefix = 'sha256=';
  if (!signatureHeader.startsWith(prefix)) return false;
  const signatureHex = signatureHeader.slice(prefix.length);

  const expectedHex = createHmac('sha256', appSecret).update(rawBody).digest('hex');
  const expected = Buffer.from(expectedHex, 'utf8');
  const given = Buffer.from(signatureHex, 'utf8');

  if (expected.length !== given.length) return false;
  return timingSafeEqual(expected, given);
}
