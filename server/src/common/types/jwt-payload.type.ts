import { UserRole } from '@prisma/client';

/**
 * Shape of both the access and refresh token payloads. `sellerId` is only
 * present when the user's `role` is `"seller"` — carried in the token so
 * M8.3's seller-scoped endpoints can trust it without a DB round trip per
 * request (still re-derived from a verified session, never from anything
 * client-submitted — see docs/ARCHITECTURE.md's security model note on
 * M8 replacing the old `AuthContext` cookie).
 */
export interface JwtPayload {
  /** Standard JWT subject claim — the user id. */
  sub: string;
  role: UserRole;
  sellerId?: string;
  /**
   * Random per-issuance nonce set on both access and refresh tokens (see
   * `AuthService#signTokenPair`) so two tokens minted for the same user in
   * the same wall-clock second are never byte-identical — without it,
   * `refresh()`'s `tokenHash` uniqueness check collides and 500s. Not a
   * lookup key itself; the refresh token's SHA-256 hash is still what
   * `RefreshToken.tokenHash` indexes on.
   */
  jti?: string;
}

/** What `@CurrentUser()` resolves to on `request.user`, set by `JwtAuthGuard`. */
export interface RequestUser {
  userId: string;
  role: UserRole;
  sellerId?: string;
}
