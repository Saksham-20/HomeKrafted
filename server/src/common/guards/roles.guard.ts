import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '@prisma/client';
import { Request } from 'express';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { RequestUser } from '../types/jwt-payload.type';

/**
 * Path prefix that may never be reached without an explicit `@Roles(...)`.
 *
 * Matched against `request.path`, which carries `main.ts`'s
 * `api/v1` global prefix — same basis as `JwtAuthGuard`'s
 * `PASSWORD_CHANGE_EXEMPT`.
 */
const ADMIN_PATH_PREFIX = '/api/v1/admin';

/**
 * Runs after `JwtAuthGuard` (registered second in `AppModule`'s
 * `APP_GUARD` list, and Nest runs global guards in registration order) —
 * `request.user` is already populated by then. A handler with no
 * `@Roles(...)` metadata is allowed through for any authenticated role;
 * `@Roles('admin')` etc. restricts it.
 *
 * **That default is fail-open, and under `/admin` it is fail-closed
 * instead.** Allowing an undecorated handler is right for the consumer
 * surface — most controllers there carry no `@Roles` at all, because any
 * signed-in person may read their own cart or wallet. It is wrong for the
 * admin surface, where the same default means a new controller that
 * forgets its decorator is reachable by **every signed-in customer**, and
 * looks completely normal in review: the route works, the screen renders,
 * and nothing fails until somebody notices. Every admin controller does
 * carry a class-level `@Roles('admin')` today; this makes that a property
 * of the path rather than of whoever wrote the file.
 *
 * Two things this deliberately does not do. It does not infer the *role*
 * from the path — an admin path with no decorator is refused, never
 * silently treated as `@Roles('admin')`, because a guard that guesses
 * intent hides the missing decorator instead of surfacing it. And it does
 * not override `@Public()`: a route that explicitly opted out of auth
 * stays out. `AdminModule` hosts two such routes (`GET /settings/public`,
 * `GET /pincodes/:pincode`), but both are mounted outside the `/admin`
 * prefix, so neither is affected either way.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    // `user` is attached by `JwtAuthGuard`, which runs first — Express's own
    // `Request` type does not carry it, same as that guard's own cast.
    const request = context.switchToHttp().getRequest<Request & { user?: RequestUser }>();

    if (!requiredRoles || requiredRoles.length === 0) {
      const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
        context.getHandler(),
        context.getClass(),
      ]);
      if (!isPublic && this.isAdminPath(request)) {
        throw new ForbiddenException(
          'This admin route declares no required role. Add @Roles(...) to it.',
        );
      }
      return true;
    }

    const user = request.user;
    if (!user || !requiredRoles.includes(user.role)) {
      throw new ForbiddenException('Insufficient role for this resource');
    }
    return true;
  }

  private isAdminPath(request: Request): boolean {
    const path = request.path ?? '';
    return path === ADMIN_PATH_PREFIX || path.startsWith(`${ADMIN_PATH_PREFIX}/`);
  }
}
