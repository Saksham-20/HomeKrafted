import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DeliveryJob, DeliveryZone, Rider } from '@prisma/client';
import { AppConfig } from '../config/configuration';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsDeliveryService } from '../notifications/notifications-delivery.service';
import { zoneFor } from './zones';
import { rankCandidates, DispatchCandidate, LOCATION_STALE_SECONDS } from './dispatch';
import { RiderSettingsService, RiderDispatchSettings } from './rider-settings.service';
import { JOB_WITH_RELATIONS_INCLUDE, JobWithRelations } from './rider-jobs.types';
import { mapActiveJobForRider, mapOfferForRider } from './rider-jobs.mapper';

/** D6: one offer at a time, nearest eligible rider — checked every 5s while the module is enabled. */
const TICK_INTERVAL_MS = 5000;
/** How often the location-ping purge runs, piggy-backing on this same interval rather than a second timer. */
const PURGE_CHECK_INTERVAL_MS = 60 * 60 * 1000;
const PING_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

/** Statuses that count as "this rider is already carrying something" for dispatch eligibility. */
const ACTIVE_JOB_STATUSES: DeliveryJob['status'][] = ['accepted', 'at_pickup', 'picked_up', 'at_drop'];

/**
 * D6's offer loop: every 5s, expire anything past its `expiresAt`, then
 * offer every `unassigned` job to its top ranked candidate. Off by
 * default (`RIDER_DISPATCH_ENABLED`), same `setInterval` + env-gate shape
 * as `ShippingService`'s reconciliation poll — one process polls, `tick`
 * is idempotent so a duplicate run wastes a query rather than double-
 * offering, and `tick(now)` is exposed directly so the e2e suite drives
 * it deterministically instead of waiting on a real timer.
 */
@Injectable()
export class DispatchService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DispatchService.name);
  private pollTimer?: NodeJS.Timeout;
  private ticking = false;
  /** In-memory, cleared the moment a job stops being unassigned — same single-process assumption as `ShippingService.polling`. A restart re-arms it, which only costs one duplicate admin message. */
  private alertedJobIds = new Set<string>();
  private lastPurgeAt: Date | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<AppConfig, true>,
    private readonly settingsService: RiderSettingsService,
    private readonly delivery: NotificationsDeliveryService,
  ) {}

  isEnabled(): boolean {
    return this.config.get('rider.dispatchEnabled', { infer: true }) === true;
  }

  onModuleInit(): void {
    if (!this.isEnabled()) return;
    this.pollTimer = setInterval(() => {
      if (this.ticking) return;
      this.ticking = true;
      void this.tick(new Date())
        .catch((err) => this.logger.warn(`Dispatch tick failed: ${(err as Error).message}`))
        .finally(() => {
          this.ticking = false;
        });
    }, TICK_INTERVAL_MS);
    this.pollTimer.unref();
    this.logger.log(`Rider dispatch running every ${TICK_INTERVAL_MS / 1000}s`);
  }

  onModuleDestroy(): void {
    if (this.pollTimer) clearInterval(this.pollTimer);
  }

  // -------------------------------------------------------------------
  // The tick
  // -------------------------------------------------------------------

  async tick(now: Date): Promise<{ expired: number; offered: number; alerted: number }> {
    const expired = await this.expireStaleOffers(now);
    const settings = await this.settingsService.get();

    const unassigned = await this.prisma.deliveryJob.findMany({ where: { status: 'unassigned' } });
    let offered = 0;
    let alerted = 0;

    for (const job of unassigned) {
      const madeOffer = await this.offerNext(job, now, settings);
      if (madeOffer) {
        offered += 1;
        this.alertedJobIds.delete(job.id);
        continue;
      }

      const since = await this.unassignedSince(job);
      const minutesUnassigned = (now.getTime() - since.getTime()) / 60000;
      if (minutesUnassigned >= settings.unassignedAlertMin && !this.alertedJobIds.has(job.id)) {
        await this.alertAdminsOfNoCandidate(job);
        this.alertedJobIds.add(job.id);
        alerted += 1;
      }
    }

    await this.purgeOldLocationPingsIfDue(now);
    return { expired, offered, alerted };
  }

  private async expireStaleOffers(now: Date): Promise<number> {
    const stale = await this.prisma.deliveryOffer.findMany({
      where: { status: 'offered', expiresAt: { lte: now } },
    });

    let count = 0;
    for (const offer of stale) {
      const offerGuard = await this.prisma.deliveryOffer.updateMany({
        where: { id: offer.id, status: 'offered' },
        data: { status: 'expired', respondedAt: now },
      });
      if (offerGuard.count !== 1) continue; // somebody else already resolved it
      await this.prisma.deliveryJob.updateMany({
        where: { id: offer.jobId, status: 'offered' },
        data: { status: 'unassigned' },
      });
      count += 1;
    }
    return count;
  }

  /** When a job most recently became `unassigned` — its own creation, or its last offer resolving, whichever is later. */
  private async unassignedSince(job: DeliveryJob): Promise<Date> {
    const lastOffer = await this.prisma.deliveryOffer.findFirst({
      where: { jobId: job.id },
      orderBy: { offeredAt: 'desc' },
    });
    if (!lastOffer) return job.createdAt;
    return lastOffer.respondedAt ?? lastOffer.expiresAt;
  }

  private async offerNext(job: DeliveryJob, now: Date, settings: RiderDispatchSettings): Promise<boolean> {
    const online = await this.prisma.rider.findMany({ where: { status: 'approved', isOnline: true } });
    if (online.length === 0) return false;
    const riderIds = online.map((r) => r.id);

    const [activeJobRiders, pendingOfferRiders, priorOfferRiders, cashRows, deliveredTodayRows, zones] =
      await Promise.all([
        this.prisma.deliveryJob.findMany({
          where: { riderId: { in: riderIds }, status: { in: ACTIVE_JOB_STATUSES } },
          select: { riderId: true },
        }),
        // D6 — "one offer at a time": a rider already evaluating a *different*
        // job's offer is not eligible for this one either.
        this.prisma.deliveryOffer.findMany({
          where: { riderId: { in: riderIds }, status: 'offered' },
          select: { riderId: true },
        }),
        this.prisma.deliveryOffer.findMany({
          where: { jobId: job.id, riderId: { in: riderIds } },
          select: { riderId: true },
        }),
        this.prisma.riderCashEntry.groupBy({ by: ['riderId'], where: { riderId: { in: riderIds } }, _sum: { amount: true } }),
        this.prisma.deliveryJob.groupBy({
          by: ['riderId'],
          where: { riderId: { in: riderIds }, status: 'delivered', deliveredAt: { gte: startOfDay(now) } },
          _count: { _all: true },
        }),
        this.prisma.deliveryZone.findMany({ where: { isActive: true } }),
      ]);

    const activeSet = new Set(activeJobRiders.map((r) => r.riderId).filter((id): id is string => Boolean(id)));
    const pendingSet = new Set(pendingOfferRiders.map((o) => o.riderId));
    const priorSet = new Set(priorOfferRiders.map((o) => o.riderId));
    const cashByRider = new Map(cashRows.map((c) => [c.riderId, Number(c._sum.amount ?? 0)]));
    const deliveredTodayByRider = new Map(deliveredTodayRows.map((d) => [d.riderId, d._count._all]));

    const candidates: DispatchCandidate[] = online.map((rider) => ({
      riderId: rider.id,
      approved: rider.status === 'approved',
      online: rider.isOnline,
      lastLat: rider.lastLat,
      lastLng: rider.lastLng,
      lastLocationAt: rider.lastLocationAt,
      hasActiveJob: activeSet.has(rider.id) || pendingSet.has(rider.id),
      alreadyOffered: priorSet.has(rider.id),
      zoneEligible: this.isZoneEligible(rider, job, zones),
      cashBalance: cashByRider.get(rider.id) ?? 0,
      cashLimit: Number(rider.cashLimit),
      deliveriesToday: deliveredTodayByRider.get(rider.id) ?? 0,
    }));

    const ranked = rankCandidates({
      job: { pickupLat: job.pickupLat, pickupLng: job.pickupLng, codAmount: job.codAmount ? Number(job.codAmount) : null },
      candidates,
      now,
      staleAfterSeconds: LOCATION_STALE_SECONDS,
    });
    if (ranked.length === 0) return false;

    const topRiderId = ranked[0] as string;
    const expiresAt = new Date(now.getTime() + settings.offerTimeoutSec * 1000);

    return this.prisma.$transaction(async (tx) => {
      const guard = await tx.deliveryJob.updateMany({
        where: { id: job.id, status: 'unassigned' },
        data: { status: 'offered', offeredAt: now },
      });
      if (guard.count !== 1) return false; // moved between our read and here
      await tx.deliveryOffer.create({ data: { jobId: job.id, riderId: topRiderId, expiresAt } });
      return true;
    });
  }

  private isZoneEligible(rider: Rider, job: DeliveryJob, zones: DeliveryZone[]): boolean {
    if (!job.zoneId) return true; // a pickup outside every zone constrains nobody — better dispatched than stuck
    if (rider.homeZoneId === job.zoneId) return true;
    if (rider.lastLat === null || rider.lastLng === null) return false;
    const riderZone = zoneFor({ lat: rider.lastLat, lng: rider.lastLng }, zones);
    return riderZone?.id === job.zoneId;
  }

  private async alertAdminsOfNoCandidate(job: DeliveryJob): Promise<void> {
    const admins = await this.prisma.user.findMany({
      where: { role: 'admin', adminScopes: { has: 'riders' } },
      select: { id: true },
    });
    for (const admin of admins) {
      try {
        await this.delivery.deliver({
          userId: admin.id,
          category: 'account',
          title: 'A delivery has no rider yet',
          body: `Job ${job.jobNumber} has had no eligible rider to offer it to for a while — check the dispatch queue.`,
          refType: 'deliveryJob',
          refId: job.id,
        });
      } catch (err) {
        this.logger.warn(`Failed to alert admin ${admin.id} about job ${job.id}: ${String(err)}`);
      }
    }
  }

  private async purgeOldLocationPingsIfDue(now: Date): Promise<void> {
    if (this.lastPurgeAt && now.getTime() - this.lastPurgeAt.getTime() < PURGE_CHECK_INTERVAL_MS) return;
    this.lastPurgeAt = now;
    const cutoff = new Date(now.getTime() - PING_RETENTION_MS);
    await this.prisma.riderLocationPing.deleteMany({ where: { recordedAt: { lt: cutoff } } });
  }

  // -------------------------------------------------------------------
  // Rider-facing: offers
  // -------------------------------------------------------------------

  async currentOffer(rider: Rider) {
    const offer = await this.prisma.deliveryOffer.findFirst({
      where: { riderId: rider.id, status: 'offered', expiresAt: { gt: new Date() } },
      orderBy: { offeredAt: 'desc' },
    });
    if (!offer) return null;
    const job = await this.prisma.deliveryJob.findUnique({ where: { id: offer.jobId }, include: JOB_WITH_RELATIONS_INCLUDE });
    if (!job) return null;
    const riderPos = rider.lastLat !== null && rider.lastLng !== null ? { lat: rider.lastLat, lng: rider.lastLng } : null;
    return mapOfferForRider(offer, job, riderPos);
  }

  async acceptOffer(rider: Rider, offerId: string) {
    const offer = await this.prisma.deliveryOffer.findUnique({ where: { id: offerId } });
    if (!offer || offer.riderId !== rider.id) throw new NotFoundException('Offer not found.');
    if (offer.status !== 'offered' || offer.expiresAt.getTime() <= Date.now()) {
      throw new ConflictException('This offer is no longer available.');
    }

    const now = new Date();
    const job: JobWithRelations | null = await this.prisma.$transaction(async (tx) => {
      const offerGuard = await tx.deliveryOffer.updateMany({
        where: { id: offerId, status: 'offered' },
        data: { status: 'accepted', respondedAt: now },
      });
      if (offerGuard.count !== 1) return null;

      const jobGuard = await tx.deliveryJob.updateMany({
        where: { id: offer.jobId, status: 'offered' },
        data: { status: 'accepted', riderId: rider.id, acceptedAt: now },
      });
      if (jobGuard.count !== 1) {
        // Rolls the offer update back too — the whole point of one
        // transaction: an offer cannot read "accepted" while its job
        // stayed with somebody else.
        throw new ConflictException('This job was already taken.');
      }

      return tx.deliveryJob.findUnique({ where: { id: offer.jobId }, include: JOB_WITH_RELATIONS_INCLUDE });
    });

    if (!job) throw new ConflictException('This offer is no longer available.');
    return mapActiveJobForRider(job);
  }

  async declineOffer(rider: Rider, offerId: string): Promise<{ declined: true }> {
    const offer = await this.prisma.deliveryOffer.findUnique({ where: { id: offerId } });
    if (!offer || offer.riderId !== rider.id) throw new NotFoundException('Offer not found.');

    const ok = await this.prisma.$transaction(async (tx) => {
      const offerGuard = await tx.deliveryOffer.updateMany({
        where: { id: offerId, status: 'offered' },
        data: { status: 'declined', respondedAt: new Date() },
      });
      if (offerGuard.count !== 1) return false;
      await tx.deliveryJob.updateMany({ where: { id: offer.jobId, status: 'offered' }, data: { status: 'unassigned' } });
      return true;
    });

    if (!ok) throw new ConflictException('This offer is no longer available.');
    return { declined: true };
  }
}

function startOfDay(now: Date): Date {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}
