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
  /** Only present on refresh tokens — ties the JWT to its DB row for rotation/revocation. */
  jti?: string;
}

/** What `@CurrentUser()` resolves to on `request.user`, set by `JwtAuthGuard`. */
export interface RequestUser {
  userId: string;
  role: UserRole;
  sellerId?: string;
}
