import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/**
 * Opts a route out of the global `JwtAuthGuard`. Use sparingly — only for
 * genuinely unauthenticated endpoints (register, login, OTP request/verify,
 * refresh, health check). Everything else is authed by default.
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
