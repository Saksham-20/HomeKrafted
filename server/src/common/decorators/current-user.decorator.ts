import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { RequestUser } from '../types/jwt-payload.type';

/**
 * Pulls the verified `RequestUser` (userId/role/sellerId) that
 * `JwtAuthGuard` attached to the request. Use in any authed controller
 * method: `@CurrentUser() user: RequestUser`.
 */
export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): RequestUser => {
  const request = ctx.switchToHttp().getRequest();
  return request.user as RequestUser;
});
