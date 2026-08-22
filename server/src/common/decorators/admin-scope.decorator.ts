import { SetMetadata } from '@nestjs/common';
import { AdminScope } from '@prisma/client';

export const ADMIN_SCOPE_KEY = 'adminScope';

/**
 * Which part of the admin panel this controller belongs to (M47).
 *
 * **Declared on the controller, not the handler.** A scope is a section of
 * the panel — "you handle the review queue", "you settle payouts" — and a
 * section is what an operator is actually given. Per-handler scopes read
 * as more rigorous and are unusable: nobody holds thirty checkboxes in
 * their head, so in practice everybody gets all thirty and the system
 * means nothing. Put a route in the controller whose section it belongs
 * to; if it belongs to two, it belongs to neither and needs its own.
 *
 * A handler-level override is supported for the rare route that genuinely
 * sits in a different section from its controller — declare it and say
 * why in a comment above it.
 *
 * `AdminScopeGuard` refuses any `/api/v1/admin` route that declares none,
 * the same fail-closed rule `RolesGuard` applies to `@Roles`. A missing
 * decorator is a route every sub-admin can reach, and it looks completely
 * normal in review.
 */
export const RequireAdminScope = (scope: AdminScope) => SetMetadata(ADMIN_SCOPE_KEY, scope);
