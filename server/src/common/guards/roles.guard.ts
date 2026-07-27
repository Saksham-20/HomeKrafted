import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '@prisma/client';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { RequestUser } from '../types/jwt-payload.type';

/**
 * Runs after `JwtAuthGuard` (registered second in `AppModule`'s
 * `APP_GUARD` list, and Nest runs global guards in registration order) —
 * `request.user` is already populated by then. A handler with no
 * `@Roles(...)` metadata is allowed through for any authenticated role;
 * `@Roles('admin')` etc. restricts it.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user as RequestUser | undefined;
    if (!user || !requiredRoles.includes(user.role)) {
      throw new ForbiddenException('Insufficient role for this resource');
    }
    return true;
  }
}
