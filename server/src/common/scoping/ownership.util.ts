import { ForbiddenException } from '@nestjs/common';
import { RequestUser } from '../types/jwt-payload.type';

/**
 * Ownership-scoping helpers for M8.1–M8.3's seller/consumer-scoped
 * endpoints. Nothing in M8.0 calls these yet (no domain endpoints exist),
 * but they're the seam every later seller query must go through instead of
 * trusting a client-submitted `vendorId`/`sellerId` — see
 * docs/ARCHITECTURE.md's note on M8 re-deriving every scoping id from a
 * verified session rather than the old mock `AuthContext`/cookie.
 */

/** Throws 403 unless `user` is an admin or the request's `sellerId` matches theirs. */
export function assertOwnSellerScope(user: RequestUser, sellerId: string): void {
  if (user.role === 'admin') return;
  if (user.role === 'seller' && user.sellerId === sellerId) return;
  throw new ForbiddenException('Not scoped to this seller account');
}

/** Throws 403 unless `user` is an admin or the request's `userId` matches theirs. */
export function assertOwnUserScope(user: RequestUser, userId: string): void {
  if (user.role === 'admin') return;
  if (user.userId === userId) return;
  throw new ForbiddenException('Not scoped to this account');
}

/** Admin queries are deliberately unscoped — this just documents/names that intent at call sites. */
export function assertAdmin(user: RequestUser): void {
  if (user.role !== 'admin') {
    throw new ForbiddenException('Admin role required');
  }
}
