import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AdminScope, UserRole } from '@prisma/client';
import { Request } from 'express';
import { PrismaService } from '../../prisma/prisma.service';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { ADMIN_SCOPE_KEY } from '../decorators/admin-scope.decorator';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { RequestUser } from '../types/jwt-payload.type';

const ADMIN_PATH_PREFIX = '/api/v1/admin';

/**
 * Sub-admins (M47): an admin reaches only the sections they hold.
 *
 * Runs after `RolesGuard`, so by the time this executes the caller is
 * already known to be an admin. What is left is *which* admin.
 *
 * **The scopes are read from the database, not the token.** Putting them
 * in the JWT would save a query and make revocation take up to an access
 * token's lifetime to bite — so somebody whose `finance` scope was pulled
 * five minutes ago could still issue a refund. The admin surface carries
 * almost no traffic and every one of these routes is about to hit the
 * database anyway; one indexed lookup by primary key is the right price
 * for "revoked means revoked".
 *
 * **Fail-closed on the path, exactly like `RolesGuard`.** An `/admin`
 * route that declares no scope is refused rather than allowed, because
 * the alternative is that a new controller which forgets its decorator is
 * reachable by *every* sub-admin — and, like the missing `@Roles` this
 * mirrors, it looks completely normal in review: the route works, the
 * screen renders, nothing fails until somebody notices.
 *
 * It does not infer a scope from the path. A guard that guesses hides the
 * missing decorator instead of surfacing it.
 */
@Injectable()
export class AdminScopeGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request & { user?: RequestUser }>();

    // Two ways in, and both are needed. The path rule covers the whole
    // `/admin` surface including a controller that forgets its `@Roles`.
    // The role rule covers the three admin-privileged routes that hang
    // off *consumer* controllers — `POST /orders/:id/refund`,
    // `POST /wallet/adjust`, `GET /users/:id` — which no path rule sees
    // and two of which move money. They are named in
    // `rbac-structure.spec.ts` for the same reason.
    const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    const isAdminOnlyRoute = requiredRoles?.length === 1 && requiredRoles[0] === 'admin';
    if (!this.isAdminPath(request) && !isAdminOnlyRoute) return true;

    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const required = this.reflector.getAllAndOverride<AdminScope>(ADMIN_SCOPE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required) {
      throw new ForbiddenException(
        'This admin route declares no admin scope. Add @RequireAdminScope(...) to it.',
      );
    }

    const user = request.user;
    if (!user) throw new ForbiddenException('Insufficient role for this resource');

    const row = await this.prisma.user.findUnique({
      where: { id: user.userId },
      select: { adminScopes: true },
    });
    const held = row?.adminScopes ?? [];
    if (!held.includes(required)) {
      // Names the section rather than the route: an operator who lands
      // here needs to know what to ask for, and "insufficient permission"
      // sends them to a colleague with nothing to say.
      throw new ForbiddenException(
        `Your admin account does not cover ${required}. Ask an admin with the users scope to add it.`,
      );
    }
    return true;
  }

  private isAdminPath(request: Request): boolean {
    const path = request.path ?? '';
    return path === ADMIN_PATH_PREFIX || path.startsWith(`${ADMIN_PATH_PREFIX}/`);
  }
}
