import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { promises as fs } from 'fs';
import * as path from 'path';
import { Prisma, RiderDocumentKind, RiderStatus, VehicleType } from '@prisma/client';
import { AppConfig } from '../../config/configuration';
import { PrismaService } from '../../prisma/prisma.service';
import { AdminAuditLogService } from '../audit-log.service';
import { NotificationsDeliveryService } from '../../notifications/notifications-delivery.service';
import { IdempotencyService } from '../../common/idempotency/idempotency.service';
import { requiredDocumentKinds } from '../../rider/required-documents';
import { describeMissing } from '../../rider/missing-item-labels';
import { ListRidersQueryDto } from './dto/list-riders.query.dto';
import { ReviewDocumentDto } from './dto/review-document.dto';
import { ReasonDto } from './dto/reason.dto';
import { SetCashLimitDto } from './dto/set-cash-limit.dto';
import { CashAdjustmentDto } from './dto/cash-adjustment.dto';
import { mapRiderDetail, mapRiderSummary } from './riders.mapper';

const RIDER_INCLUDE = { documents: true } as const;

/**
 * The rider onboarding review queue + zone/document/status admin actions
 * (R1's slice; deliveries/cash/payouts/SOS are R2/R3).
 *
 * Every state transition below is one guarded `updateMany({ where: {
 * id, status: from } })` checked for `count === 1` — the cross-cutting
 * rule (docs/RIDER-APP.md §10): it is what stops two admins clicking
 * Approve on the same tab at once from both succeeding, or an Approve
 * landing on a rider a second admin just rejected a moment earlier.
 */
@Injectable()
export class AdminRidersService {
  private readonly logger = new Logger(AdminRidersService.name);
  private readonly kycDir: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AdminAuditLogService,
    private readonly delivery: NotificationsDeliveryService,
    private readonly idempotency: IdempotencyService,
    config: ConfigService<AppConfig, true>,
  ) {
    this.kycDir = config.get('rider.kycDir', { infer: true });
  }

  async list(query: ListRidersQueryDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    // The default filter is the one with work in it (the portal-kit
    // rule) — a queue that opens on "everyone" buries the nine
    // applications actually waiting behind however many are already
    // approved.
    const status: RiderStatus = query.status ?? 'under_review';

    const where: Prisma.RiderWhereInput = { status, homeZoneId: query.zoneId };

    const [rows, total, zoneIds] = await Promise.all([
      this.prisma.rider.findMany({
        where,
        orderBy: { submittedAt: 'asc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.rider.count({ where }),
      this.prisma.deliveryZone.findMany({ select: { id: true, name: true, city: true, centerLat: true, centerLng: true, radiusKm: true, isActive: true, createdAt: true, updatedAt: true } }),
    ]);

    const zoneById = new Map(zoneIds.map((zone) => [zone.id, zone]));
    const users = await this.prisma.user.findMany({
      where: { id: { in: rows.map((r) => r.userId) } },
      select: { id: true, email: true, phone: true },
    });
    const userById = new Map(users.map((u) => [u.id, u]));

    return {
      items: rows.map((rider) =>
        mapRiderSummary(
          rider,
          { email: userById.get(rider.userId)?.email ?? null, phone: userById.get(rider.userId)?.phone ?? null },
          rider.homeZoneId ? (zoneById.get(rider.homeZoneId) ?? null) : null,
        ),
      ),
      page,
      pageSize,
      total,
    };
  }

  private async requireRider(id: string) {
    const rider = await this.prisma.rider.findUnique({ where: { id }, include: RIDER_INCLUDE });
    if (!rider) {
      throw new NotFoundException('Rider not found.');
    }
    return rider;
  }

  async detail(adminId: string, id: string, revealBank: boolean) {
    const rider = await this.requireRider(id);
    const [user, zone] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: rider.userId }, select: { email: true, phone: true } }),
      rider.homeZoneId ? this.prisma.deliveryZone.findUnique({ where: { id: rider.homeZoneId } }) : null,
    ]);

    if (revealBank) {
      await this.auditLog.log({
        actorId: adminId,
        action: 'rider.bank_reveal',
        targetType: 'Rider',
        targetId: id,
      });
    }

    return mapRiderDetail(rider, { email: user?.email ?? null, phone: user?.phone ?? null }, zone, revealBank);
  }

  /**
   * `GET /admin/riders/:id/documents/:kind/file` — the bytes, streamed
   * straight from `RIDER_KYC_DIR`. No public URL exists for this file at
   * any point; the controller sets `Cache-Control: no-store` so a shared
   * or corporate proxy never keeps a copy.
   */
  async readDocumentFile(adminId: string, riderId: string, kind: string) {
    const document = await this.prisma.riderDocument.findFirst({
      where: { riderId, kind: kind as RiderDocumentKind },
    });
    if (!document) {
      throw new NotFoundException('That document has not been uploaded.');
    }

    const buffer = await fs.readFile(path.join(this.kycDir, document.storageKey));

    await this.auditLog.log({
      actorId: adminId,
      action: 'rider.document_view',
      targetType: 'RiderDocument',
      targetId: document.id,
      metadata: { riderId, kind: document.kind },
    });

    return { buffer, mime: 'image/webp' as const };
  }

  async reviewDocument(adminId: string, riderId: string, kindParam: string, dto: ReviewDocumentDto) {
    const document = await this.prisma.riderDocument.findFirst({
      where: { riderId, kind: kindParam as RiderDocumentKind },
    });
    if (!document) {
      throw new NotFoundException('That document has not been uploaded.');
    }

    const updated = await this.prisma.riderDocument.update({
      where: { id: document.id },
      data: {
        status: dto.status,
        note: dto.note ?? null,
        reviewedById: adminId,
        reviewedAt: new Date(),
      },
    });

    await this.auditLog.log({
      actorId: adminId,
      action: 'rider.document_review',
      targetType: 'RiderDocument',
      targetId: document.id,
      metadata: { riderId, kind: document.kind, status: dto.status },
    });

    if (dto.status === 'rejected') {
      const rider = await this.prisma.rider.findUnique({ where: { id: riderId } });
      if (rider) {
        void this.notify(
          rider.userId,
          'A document needs to be re-uploaded',
          dto.note ?? 'One of your documents was rejected — check the app for which one.',
          document.id,
        );
      }
    }

    return { kind: updated.kind, status: updated.status, note: updated.note ?? undefined };
  }

  /** `requiredDocumentKinds` not yet all `approved` — what `approve` refuses on. */
  private async unapprovedRequiredDocs(riderId: string, vehicleType: VehicleType) {
    const documents = await this.prisma.riderDocument.findMany({ where: { riderId } });
    const byKind = new Map(documents.map((d) => [d.kind, d]));
    return requiredDocumentKinds(vehicleType).filter((kind) => byKind.get(kind)?.status !== 'approved');
  }

  async approve(adminId: string, id: string) {
    const rider = await this.requireRider(id);
    if (rider.status !== 'under_review') {
      throw new ConflictException(`This rider is "${rider.status}" — only an application under review can be approved.`);
    }
    if (!rider.vehicleType) {
      throw new BadRequestException('This application has no vehicle type set — it should not have reached review.');
    }

    const unapproved = await this.unapprovedRequiredDocs(id, rider.vehicleType);
    if (unapproved.length > 0) {
      // A plain array, not `{ message, unapproved }` — `AllExceptionsFilter`
      // strips every field but `message`/`code` off a thrown body
      // (`docs/API.md`'s one envelope), and an array is the shape it
      // actually joins into a readable sentence (see `describeMissing`'s
      // doc comment in `rider.service.ts`, which this reuses).
      throw new BadRequestException([
        'Every required document has to be approved before this rider can be.',
        ...unapproved.map((kind) => describeMissing(kind)),
      ]);
    }

    const result = await this.prisma.rider.updateMany({
      where: { id, status: 'under_review' },
      data: { status: 'approved', approvedAt: new Date(), approvedById: adminId, statusNote: null },
    });
    if (result.count !== 1) {
      throw new ConflictException('Somebody else already decided this application. Refresh and check its status.');
    }

    await this.auditLog.log({ actorId: adminId, action: 'rider.approve', targetType: 'Rider', targetId: id });
    void this.notify(rider.userId, "You're approved to ride with Homekrafted", 'Open the app to go online and start taking deliveries.', id);

    return this.detail(adminId, id, false);
  }

  async reject(adminId: string, id: string, dto: ReasonDto) {
    const rider = await this.requireRider(id);
    const result = await this.prisma.rider.updateMany({
      where: { id, status: 'under_review' },
      data: { status: 'rejected', statusNote: dto.reason },
    });
    if (result.count !== 1) {
      throw new ConflictException(`This rider is "${rider.status}" — only an application under review can be rejected.`);
    }

    await this.auditLog.log({ actorId: adminId, action: 'rider.reject', targetType: 'Rider', targetId: id, metadata: { reason: dto.reason } });
    void this.notify(rider.userId, 'Your rider application needs another look', dto.reason, id);

    return this.detail(adminId, id, false);
  }

  async suspend(adminId: string, id: string, dto: ReasonDto) {
    const rider = await this.requireRider(id);
    const result = await this.prisma.rider.updateMany({
      where: { id, status: 'approved' },
      data: { status: 'suspended', statusNote: dto.reason, isOnline: false, onlineSince: null },
    });
    if (result.count !== 1) {
      throw new ConflictException(`This rider is "${rider.status}" — only an approved rider can be suspended.`);
    }

    await this.auditLog.log({ actorId: adminId, action: 'rider.suspend', targetType: 'Rider', targetId: id, metadata: { reason: dto.reason } });
    void this.notify(rider.userId, 'Your Homekrafted rider account has been suspended', dto.reason, id);

    return this.detail(adminId, id, false);
  }

  async reinstate(adminId: string, id: string) {
    const rider = await this.requireRider(id);
    const result = await this.prisma.rider.updateMany({
      where: { id, status: 'suspended' },
      data: { status: 'approved', statusNote: null },
    });
    if (result.count !== 1) {
      throw new ConflictException(`This rider is "${rider.status}" — only a suspended rider can be reinstated.`);
    }

    await this.auditLog.log({ actorId: adminId, action: 'rider.reinstate', targetType: 'Rider', targetId: id });
    void this.notify(rider.userId, 'Your Homekrafted rider account is active again', 'You can go online whenever you are ready.', id);

    return this.detail(adminId, id, false);
  }

  async setCashLimit(adminId: string, id: string, dto: SetCashLimitDto) {
    const rider = await this.requireRider(id);
    await this.prisma.rider.update({ where: { id }, data: { cashLimit: dto.amount } });

    await this.auditLog.log({
      actorId: adminId,
      action: 'rider.cash_limit',
      targetType: 'Rider',
      targetId: id,
      metadata: { from: Number(rider.cashLimit), to: dto.amount },
    });

    return this.detail(adminId, id, false);
  }

  /**
   * `PUT /admin/riders/:id/cash-adjustment` — R3's escape hatch. A
   * signed `RiderCashEntry(type: 'adjustment')`, written and audited
   * together so the ledger row and the audit trail can never disagree
   * about who made this change and why. `Idempotency-Key`-guarded — a
   * retried click on a money-mutating admin route must not write the
   * adjustment twice.
   */
  async cashAdjustment(adminId: string, id: string, dto: CashAdjustmentDto, idempotencyKey: string | undefined) {
    const rider = await this.requireRider(id);

    // Mapped to plain JSON *inside* `work` — `IdempotencyService` stores
    // the result as `Json` and a replay hands back that stored value
    // rather than a fresh Prisma row, so a `Date`/`Decimal` returned
    // straight from `.create()` is a `string`/`number` on the second
    // call and a real object on the first. Returning the already-mapped
    // shape both times is what makes the two calls' responses identical
    // (`silent-failure.spec.ts`'s cousin lesson: never let a replay's
    // shape drift from a first call's).
    const entry = await this.idempotency.run(adminId, 'admin.riders.cash-adjustment', idempotencyKey, async (tx) => {
      const created = await tx.riderCashEntry.create({
        data: { riderId: rider.id, type: 'adjustment', amount: dto.amount, note: dto.note, createdById: adminId },
      });
      return { id: created.id, amount: Number(created.amount), note: created.note ?? undefined, createdAt: created.createdAt.toISOString() };
    });

    await this.auditLog.log({
      actorId: adminId,
      action: 'rider.cash_adjustment',
      targetType: 'Rider',
      targetId: id,
      metadata: { amount: dto.amount, note: dto.note },
    });

    void this.notify(
      rider.userId,
      'Your cash balance was adjusted',
      `An admin ${dto.amount > 0 ? 'added' : 'removed'} ₹${Math.abs(dto.amount).toFixed(2)} ${dto.amount > 0 ? 'to' : 'from'} what you owe — ${dto.note}`,
      id,
    );

    return entry;
  }

  /**
   * Never throws into a caller — an admin action (approve, reject, a
   * document decision) must not fail because a message could not be
   * sent. Same rule as `ModerationNotificationsService`.
   */
  private async notify(userId: string, title: string, body: string, refId: string): Promise<void> {
    try {
      await this.delivery.deliver({ userId, category: 'account', title, body, refType: 'rider', refId });
    } catch (err) {
      this.logger.warn(`Failed to notify rider ${userId}: ${String(err)}`);
    }
  }
}
