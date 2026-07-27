import { SetMetadata } from '@nestjs/common';
import { UserRole } from '@prisma/client';

export const ROLES_KEY = 'roles';

/**
 * Restricts a route to one or more `UserRole`s, enforced by `RolesGuard`.
 * Omit entirely to allow any authenticated role through. Example:
 * `@Roles('admin')`, `@Roles('seller', 'admin')`.
 */
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);
