import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface AuditLogEntry {
  actorId: string;
  action: string;
  targetType: string;
  targetId?: string;
  metadata?: Record<string, unknown>;
}

export interface ListAuditLogQuery {
  targetType?: string;
  actorId?: string;
  page?: number;
  pageSize?: number;
}

/**
 * `AdminAuditLog` writer/reader — every admin **mutation** across this
 * module (`server/src/admin/**`) calls `log()` after the mutation
 * succeeds, never before (so a rejected/rolled-back action never leaves a
 * misleading audit row). Deliberately a plain `create()` outside the
 * mutation's own transaction where one exists (e.g. `WalletService`'s
 * row-locked ledger tx) — the audit row is a record *that* the action
 * happened, not a participant in the money-safety invariant itself, so it
 * doesn't need to share that transaction's atomicity.
 */
@Injectable()
export class AdminAuditLogService {
  constructor(private readonly prisma: PrismaService) {}

  async log(entry: AuditLogEntry): Promise<void> {
    await this.prisma.adminAuditLog.create({
      data: {
        actorId: entry.actorId,
        action: entry.action,
        targetType: entry.targetType,
        targetId: entry.targetId,
        metadata: (entry.metadata ?? undefined) as Prisma.InputJsonValue | undefined,
      },
    });
  }

  async list(query: ListAuditLogQuery) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 50;
    const where: Prisma.AdminAuditLogWhereInput = {
      targetType: query.targetType,
      actorId: query.actorId,
    };

    const [rows, total, targetTypeRows] = await Promise.all([
      this.prisma.adminAuditLog.findMany({
        where,
        include: { actor: { select: { id: true, name: true, email: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.adminAuditLog.count({ where }),
      // The distinct entity kinds actually present, so the filter's
      // options come from the data rather than a hand-maintained list on
      // the client. A typed list is a twin: it goes stale the first time
      // a new `targetType` is logged and nobody notices, because the
      // symptom is a filter that silently cannot find things.
      // Unfiltered on purpose — narrowing to one type must not empty the
      // dropdown you would use to pick a different one.
      this.prisma.adminAuditLog.findMany({
        distinct: ['targetType'],
        select: { targetType: true },
        orderBy: { targetType: 'asc' },
      }),
    ]);

    return {
      items: rows.map((row) => ({
        id: row.id,
        actorId: row.actorId,
        actorName: row.actor.name,
        actorEmail: row.actor.email ?? undefined,
        action: row.action,
        targetType: row.targetType,
        targetId: row.targetId ?? undefined,
        metadata: (row.metadata as Record<string, unknown> | null) ?? undefined,
        createdAt: row.createdAt.toISOString(),
      })),
      page,
      pageSize,
      total,
      targetTypes: targetTypeRows.map((r) => r.targetType),
    };
  }
}
