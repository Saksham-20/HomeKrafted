import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '@prisma/client';
import { RolesGuard } from '../../src/common/guards/roles.guard';
import { IS_PUBLIC_KEY } from '../../src/common/decorators/public.decorator';
import { ROLES_KEY } from '../../src/common/decorators/roles.decorator';
import { RequestUser } from '../../src/common/types/jwt-payload.type';

/**
 * `RolesGuard`'s default is deliberately fail-open — the consumer surface
 * is full of controllers with no `@Roles` at all, because any signed-in
 * person may read their own cart. The bug that default hides is on the
 * admin surface: a new `/admin` controller that forgets its decorator is
 * reachable by every signed-in customer, and nothing about it looks
 * wrong. The route works, the screen renders, review passes.
 *
 * So the two halves are asserted against each other here. Dropping either
 * one is a silent regression: lose the fail-open half and every consumer
 * route 403s, lose the fail-closed half and the hole reopens with no
 * failing test to notice.
 */

function contextFor(path: string, user?: RequestUser): ExecutionContext {
  const request = { path, user };
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => function handler() {},
    getClass: () => class Controller {},
  } as unknown as ExecutionContext;
}

/**
 * Stands in for the real `Reflector`. `@Roles`/`@Public` write metadata a
 * decorator would normally attach; reading it back by key is the whole of
 * what the guard does with it.
 */
function reflectorWith(metadata: { roles?: UserRole[]; isPublic?: boolean }): Reflector {
  return {
    getAllAndOverride: (key: string) => {
      if (key === ROLES_KEY) return metadata.roles;
      if (key === IS_PUBLIC_KEY) return metadata.isPublic;
      return undefined;
    },
  } as unknown as Reflector;
}

const admin: RequestUser = { userId: 'u_admin', role: 'admin' };
const consumer: RequestUser = { userId: 'u_buyer', role: 'consumer' };

describe('an explicit @Roles(...)', () => {
  it('admits the role it names', () => {
    const guard = new RolesGuard(reflectorWith({ roles: ['admin'] }));
    expect(guard.canActivate(contextFor('/api/v1/admin/payouts', admin))).toBe(true);
  });

  it('refuses every other role', () => {
    const guard = new RolesGuard(reflectorWith({ roles: ['admin'] }));
    expect(() => guard.canActivate(contextFor('/api/v1/admin/payouts', consumer))).toThrow(
      ForbiddenException,
    );
  });

  it('refuses an unauthenticated request', () => {
    const guard = new RolesGuard(reflectorWith({ roles: ['admin'] }));
    expect(() => guard.canActivate(contextFor('/api/v1/admin/payouts'))).toThrow(
      ForbiddenException,
    );
  });
});

describe('no @Roles on a consumer route', () => {
  // The fail-open half. `/cart`, `/wallet`, `/notifications` and most of
  // the catalog carry no `@Roles`, and must not start needing one.
  it.each([
    '/api/v1/cart',
    '/api/v1/wallet',
    '/api/v1/notifications/preferences',
    '/api/v1/orders/history',
  ])('admits any authenticated role on %s', (path) => {
    const guard = new RolesGuard(reflectorWith({}));
    expect(guard.canActivate(contextFor(path, consumer))).toBe(true);
  });

  it('is not confused by a path that merely contains the word admin', () => {
    const guard = new RolesGuard(reflectorWith({}));
    expect(guard.canActivate(contextFor('/api/v1/users/administrator', consumer))).toBe(true);
  });
});

describe('no @Roles on an /admin route', () => {
  // The fail-closed half — the actual fix.
  it.each([
    '/api/v1/admin',
    '/api/v1/admin/payouts',
    '/api/v1/admin/wallet/u_1/adjust',
    '/api/v1/admin/some-controller-added-next-year',
  ])('refuses %s even for an admin, rather than guessing the role', (path) => {
    const guard = new RolesGuard(reflectorWith({}));
    expect(() => guard.canActivate(contextFor(path, admin))).toThrow(ForbiddenException);
  });

  it('refuses a consumer outright', () => {
    const guard = new RolesGuard(reflectorWith({}));
    expect(() => guard.canActivate(contextFor('/api/v1/admin/users', consumer))).toThrow(
      ForbiddenException,
    );
  });

  it('leaves an explicitly @Public() route alone', () => {
    // Nothing under /admin is public today. Asserted so that if something
    // ever is, the opt-out is the documented one rather than a surprise.
    const guard = new RolesGuard(reflectorWith({ isPublic: true }));
    expect(guard.canActivate(contextFor('/api/v1/admin/health'))).toBe(true);
  });

  it('does not fire on the admin-module routes mounted outside /admin', () => {
    // `GET /settings/public` and `GET /pincodes/:pincode` live in
    // AdminModule but are public consumer endpoints.
    const guard = new RolesGuard(reflectorWith({ isPublic: true }));
    expect(guard.canActivate(contextFor('/api/v1/settings/public'))).toBe(true);
    expect(guard.canActivate(contextFor('/api/v1/pincodes/160017'))).toBe(true);
  });
});
