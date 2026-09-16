import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { DeliveryJobStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AdminAuditLogService } from '../audit-log.service';
import { DeliveryJobsService } from '../../rider/delivery-jobs.service';
import { DeliveryOrderReconcileService } from '../../rider/delivery-order-reconcile.service';
import { CreateDeliveryDto } from './dto/create-delivery.dto';
import { ReassignDeliveryDto } from './dto/reassign-delivery.dto';
import { ListDeliveriesQueryDto } from './dto/list-deliveries.query.dto';
import { mapDeliveryDetail, mapDeliverySummary } from './deliveries.mapper';

const SUMMARY_INCLUDE = {
  vendor: { select: { name: true } },
  address: { select: { city: true } },
  zone: { select: { name: true } },
  rider: { select: { id: true, user: { select: { name: true } } } },
} satisfies Prisma.DeliveryJobInclude;

const DETAIL_INCLUDE = {
  vendor: { include: { profile: true, seller: { include: { user: { select: { phone: true } } } } } },
  address: true,
  zone: { select: { name: true } },
  rider: { include: { user: { select: { name: true } } } },
} satisfies Prisma.DeliveryJobInclude;

/** Statuses a job may still be reassigned from — anything not already resolved one way or another. */
const REASSIGNABLE_STATUSES: DeliveryJobStatus[] = ['unassigned', 'offered', 'accepted', 'at_pickup'];

/**
 * `/admin/deliveries` — the despatch queue's dashboard. `create` is the
 * manual-dispatch door (scope `orders` — see the controller's own
 * comment on why it differs from the rest of this file's `riders`
 * scope); everything else reads or corrects a job already in flight.
 */
@Injectable()
export class AdminDeliveriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AdminAuditLogService,
    private readonly deliveryJobs: DeliveryJobsService,
    private readonly reconcile: DeliveryOrderReconcileService,
  ) {}

  async create(adminId: string, dto: CreateDeliveryDto) {
    const jobs = await this.deliveryJobs.createForOrder(dto.orderId, dto.vendorId);
    for (const job of jobs) {
      await this.auditLog.log({
        actorId: adminId,
        action: 'delivery.create',
        targetType: 'DeliveryJob',
        targetId: job.id,
        metadata: { orderId: dto.orderId, vendorId: dto.vendorId },
      });
    }
    return Promise.all(jobs.map((job) => this.detail(job.id)));
  }

  async list(query: ListDeliveriesQueryDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 50;
    const where: Prisma.DeliveryJobWhereInput = query.status ? { status: query.status } : {};

    const [rows, total] = await Promise.all([
      this.prisma.deliveryJob.findMany({
        where,
        include: SUMMARY_INCLUDE,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.deliveryJob.count({ where }),
    ]);

    return { items: rows.map(mapDeliverySummary), page, pageSize, total };
  }

  async detail(id: string) {
    const job = await this.requireJob(id);
    const [proofs, offers, pings] = await Promise.all([
      this.prisma.deliveryProof.findMany({ where: { jobId: id }, orderBy: { takenAt: 'asc' } }),
      this.prisma.deliveryOffer.findMany({
        where: { jobId: id },
        include: { rider: { include: { user: { select: { name: true } } } } },
        orderBy: { offeredAt: 'asc' },
      }),
      this.prisma.riderLocationPing.findMany({ where: { jobId: id }, orderBy: { recordedAt: 'desc' }, take: 200 }),
    ]);
    return mapDeliveryDetail(job, proofs, offers, pings);
  }

  private async requireJob(id: string) {
    const job = await this.prisma.deliveryJob.findUnique({ where: { id }, include: DETAIL_INCLUDE });
    if (!job) throw new NotFoundException('Delivery not found.');
    return job;
  }

  /**
   * Withdraws any live offer and either direct-assigns a named,
   * approved rider (`accepted`, skipping the offer loop entirely — an
   * operator override, not a new offer nobody would see) or hands the
   * job back to `unassigned` for the dispatcher to re-offer on its next
   * tick.
   */
  async reassign(adminId: string, id: string, dto: ReassignDeliveryDto) {
    const job = await this.requireJob(id);
    if (!REASSIGNABLE_STATUSES.includes(job.status)) {
      throw new ConflictException(`This delivery is "${job.status}" and can no longer be reassigned.`);
    }

    await this.prisma.deliveryOffer.updateMany({
      where: { jobId: id, status: 'offered' },
      data: { status: 'withdrawn', respondedAt: new Date() },
    });

    if (dto.riderId) {
      const rider = await this.prisma.rider.findUnique({ where: { id: dto.riderId } });
      if (!rider || rider.status !== 'approved') {
        throw new BadRequestException('That is not an approved rider.');
      }
      const result = await this.prisma.deliveryJob.updateMany({
        where: { id, status: job.status },
        data: { status: 'accepted', riderId: dto.riderId, acceptedAt: new Date() },
      });
      if (result.count !== 1) throw new ConflictException('This delivery has already moved on.');
    } else {
      const result = await this.prisma.deliveryJob.updateMany({
        where: { id, status: job.status },
        data: { status: 'unassigned', riderId: null, acceptedAt: null, arrivedPickupAt: null },
      });
      if (result.count !== 1) throw new ConflictException('This delivery has already moved on.');
    }

    await this.auditLog.log({
      actorId: adminId,
      action: 'delivery.reassign',
      targetType: 'DeliveryJob',
      targetId: id,
      metadata: { riderId: dto.riderId ?? null, from: job.status },
    });
    return this.detail(id);
  }

  async cancel(adminId: string, id: string, reason: string) {
    const job = await this.requireJob(id);
    if (job.status === 'delivered' || job.status === 'cancelled') {
      throw new ConflictException(`This delivery is already "${job.status}".`);
    }

    await this.prisma.deliveryOffer.updateMany({
      where: { jobId: id, status: 'offered' },
      data: { status: 'withdrawn', respondedAt: new Date() },
    });
    const result = await this.prisma.deliveryJob.updateMany({
      where: { id, status: job.status },
      data: { status: 'cancelled', cancelReason: reason },
    });
    if (result.count !== 1) throw new ConflictException('This delivery has already moved on.');

    await this.auditLog.log({ actorId: adminId, action: 'delivery.cancel', targetType: 'DeliveryJob', targetId: id, metadata: { reason } });
    return this.detail(id);
  }

  /**
   * The one path that may stamp `delivered` without a matching OTP — for
   * exactly the case the brief names (a buyer who lost their phone). It
   * is audited with the reason, same as every other override in this
   * codebase (M15's payment overrides, M57's despatch cancels).
   */
  async overrideDeliver(adminId: string, id: string, reason: string) {
    const job = await this.requireJob(id);
    if (job.status === 'delivered') throw new ConflictException('This delivery is already delivered.');
    if (job.status === 'cancelled' || job.status === 'returned') {
      throw new ConflictException(`This delivery is "${job.status}" and cannot be marked delivered.`);
    }

    const result = await this.prisma.deliveryJob.updateMany({
      where: { id, status: job.status },
      data: { status: 'delivered', deliveredAt: new Date() },
    });
    if (result.count !== 1) throw new ConflictException('This delivery has already moved on.');

    await this.auditLog.log({
      actorId: adminId,
      action: 'delivery.override_deliver',
      targetType: 'DeliveryJob',
      targetId: id,
      metadata: { reason },
    });
    await this.reconcile.reconcile(job.orderId);
    return this.detail(id);
  }
}
