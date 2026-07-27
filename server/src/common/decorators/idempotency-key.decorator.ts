import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Request } from 'express';

/**
 * Reads a caller-supplied idempotency key for a money-mutating endpoint —
 * the `Idempotency-Key` header (preferred; Stripe/Razorpay-style
 * convention) or, failing that, an `idempotencyKey` field on the request
 * body. Returns `undefined` when neither is present, in which case the
 * op still runs (see `IdempotencyService.run`) but without replay
 * protection — every money-mutating endpoint that accepts this should be
 * documented as "safe to retry only when a key is supplied".
 */
export const IdempotencyKey = createParamDecorator((_data: unknown, ctx: ExecutionContext): string | undefined => {
  const request = ctx.switchToHttp().getRequest<Request>();
  const header = request.headers['idempotency-key'];
  if (typeof header === 'string' && header.trim()) return header.trim();

  const body = request.body as Record<string, unknown> | undefined;
  const bodyKey = body?.idempotencyKey;
  return typeof bodyKey === 'string' && bodyKey.trim() ? bodyKey.trim() : undefined;
});
