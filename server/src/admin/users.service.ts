import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PublicUser } from '../auth/auth.service';
import { AdminAuditLogService } from './audit-log.service';
import { ListAdminUsersQueryDto } from './dto/list-admin-users.query.dto';

const PUBLIC_USER_SELECT = {
  id: true,
  name: true,
  email: true,
  phone: true,
  role: true,
  referralCode: true,
  createdAt: true,
  suspended: true,
} as const;

const DEFAULT_USER_PAGE_SIZE = 25;

export interface PaginatedUsers {
  items: PublicUser[];
  page: number;
  pageSize: number;
  total: number;
}

/** Unscoped — every read here spans every user, unlike `UsersService` (owner-scoped to the caller's own account). */
@Injectable()
export class AdminUsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AdminAuditLogService,
  ) {}

  /**
   * One page of accounts, newest first.
   *
   * This returned **every user on the platform** and the screen filtered
   * and searched the array in the browser — fine at 44 seeded accounts,
   * and the single query on this server that grows with the entire
   * customer base. `role`, `status` and `q` are all applied in SQL, so a
   * search still spans every account rather than the page in front of the
   * admin.
   */
  async list(query: ListAdminUsersQueryDto = {}): Promise<PaginatedUsers> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? DEFAULT_USER_PAGE_SIZE;

    const where: Prisma.UserWhereInput = {};
    if (query.role) where.role = query.role;
    // `Boolean @default(false)`, not nullable — every row has a real
    // answer, so this needs no third state.
    if (query.status) where.suspended = query.status === 'suspended';
    if (query.q) {
      const contains = { contains: query.q, mode: 'insensitive' as const };
      where.OR = [{ name: contains }, { email: contains }, { phone: contains }];
    }

    const [items, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        select: PUBLIC_USER_SELECT,
        // `id` after `createdAt` because seeded accounts share a
        // timestamp; without it a page boundary can repeat one row and
        // drop another.
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.user.count({ where }),
    ]);

    return { items, page, pageSize, total };
  }

  async getById(id: string): Promise<PublicUser> {
    const user = await this.prisma.user.findUnique({ where: { id }, select: PUBLIC_USER_SELECT });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  /** Sets `User.suspended` — the same flag `AuthService` already gates login/refresh on, so a suspended user's next login/refresh attempt is rejected (`401`) even mid-session (existing access tokens still expire naturally on their own short TTL). */
  async setSuspended(adminUserId: string, id: string, suspended: boolean): Promise<PublicUser> {
    const existing = await this.prisma.user.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('User not found');

    const updated = await this.prisma.user.update({ where: { id }, data: { suspended }, select: PUBLIC_USER_SELECT });

    await this.auditLog.log({
      actorId: adminUserId,
      action: suspended ? 'user.suspend' : 'user.reactivate',
      targetType: 'User',
      targetId: id,
    });

    return updated;
  }
}
