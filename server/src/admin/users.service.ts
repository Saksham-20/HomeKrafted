import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PublicUser } from '../auth/auth.service';
import { AdminAuditLogService } from './audit-log.service';

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

/** Unscoped — every read here spans every user, unlike `UsersService` (owner-scoped to the caller's own account). */
@Injectable()
export class AdminUsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AdminAuditLogService,
  ) {}

  async list(): Promise<PublicUser[]> {
    return this.prisma.user.findMany({ select: PUBLIC_USER_SELECT, orderBy: { createdAt: 'desc' } });
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
