import { UserRole } from '@prisma/client';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

const ROLES: UserRole[] = ['consumer', 'seller', 'admin'];
export const USER_STATUSES = ['active', 'suspended'] as const;
export type AdminUserStatus = (typeof USER_STATUSES)[number];

/** Query for `GET /admin/users`. */
export class ListAdminUsersQueryDto {
  @IsOptional()
  @IsIn(ROLES, { message: `role must be one of ${ROLES.join(', ')}` })
  role?: UserRole;

  @IsOptional()
  @IsIn(USER_STATUSES, { message: `status must be one of ${USER_STATUSES.join(', ')}` })
  status?: AdminUserStatus;

  /**
   * Matches name, email or phone — the three columns the admin row shows.
   *
   * Server-side for the same reason the order list's search is: this
   * endpoint used to return **every account on the platform**, and the
   * screen searched the array. Turning that into a page without moving the
   * search would mean an admin looking up the person on the phone to them
   * is told no such user exists.
   */
  @IsOptional()
  @IsString()
  @MaxLength(120)
  q?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;
}
