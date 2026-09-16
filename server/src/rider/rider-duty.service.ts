import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { DeliveryJobStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RequestUser } from '../common/types/jwt-payload.type';
import { RiderOnboardingService } from './rider.service';
import { SetDutyDto } from './dto/set-duty.dto';
import { RecordLocationDto } from './dto/record-location.dto';

/** Statuses that count as "this rider is mid-delivery" — going offline is refused while any of these is theirs. */
const ACTIVE_JOB_STATUSES: DeliveryJobStatus[] = ['accepted', 'at_pickup', 'picked_up', 'at_drop'];

/** A ping older than this (relative to when the batch arrives) is not trusted for anything — §4's `POST /rider/location`. */
const PING_MAX_AGE_MS = 10 * 60 * 1000;
/** A ping worse than this accuracy is dropped rather than corrupting `Rider.lastLat/lastLng`. */
const PING_MAX_ACCURACY_M = 100;

/**
 * §2.2's shift — going online/offline — and §4's location batch. Kept
 * apart from `RiderJobsService`: this is about the rider's own standing
 * state, not any one job.
 */
@Injectable()
export class RiderDutyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly riders: RiderOnboardingService,
  ) {}

  /**
   * `POST /rider/duty`. Going online requires an `approved` rider and a
   * fresh location fix — **not** a clear cash balance: the cash limit
   * only filters which *offers* reach a rider (D9's "over the limit ⇒ no
   * new COD offers, prepaid still allowed"), it never keeps somebody from
   * going online at all. Going offline is refused while a job is still
   * theirs to finish.
   */
  async setDuty(user: RequestUser, dto: SetDutyDto) {
    const rider = await this.riders.resolveRider(user);

    if (dto.online) {
      if (rider.status !== 'approved') {
        throw new ConflictException('Only an approved rider can go online.');
      }
      if (dto.lat === undefined || dto.lng === undefined) {
        throw new BadRequestException('A location fix is needed to go online.');
      }
      const now = new Date();
      await this.prisma.rider.update({
        where: { id: rider.id },
        data: { isOnline: true, onlineSince: now, lastLat: dto.lat, lastLng: dto.lng, lastLocationAt: now },
      });
    } else {
      const activeJob = await this.prisma.deliveryJob.findFirst({
        where: { riderId: rider.id, status: { in: ACTIVE_JOB_STATUSES } },
      });
      if (activeJob) {
        throw new ConflictException(
          'You have a delivery in progress — finish it (or ask support to reassign it) before going offline.',
        );
      }
      await this.prisma.rider.update({ where: { id: rider.id }, data: { isOnline: false, onlineSince: null } });
    }

    const updated = await this.prisma.rider.findUniqueOrThrow({ where: { id: rider.id } });
    return { isOnline: updated.isOnline, onlineSince: updated.onlineSince?.toISOString() };
  }

  /**
   * `POST /rider/location` — up to 50 pings at once. Anything stale or
   * imprecise is dropped before it ever reaches `RiderLocationPing` or
   * `Rider.lastLat/lastLng`, both of which dispatch and geofencing trust.
   */
  async recordLocation(user: RequestUser, dto: RecordLocationDto) {
    const rider = await this.riders.resolveRider(user);
    const now = new Date();

    const usable = dto.pings.filter((ping) => {
      if (ping.accuracyM !== undefined && ping.accuracyM > PING_MAX_ACCURACY_M) return false;
      const recordedAt = new Date(ping.recordedAt);
      if (Number.isNaN(recordedAt.getTime())) return false;
      return now.getTime() - recordedAt.getTime() <= PING_MAX_AGE_MS;
    });

    if (usable.length === 0) {
      return { accepted: 0, total: dto.pings.length };
    }

    await this.prisma.riderLocationPing.createMany({
      data: usable.map((ping) => ({
        riderId: rider.id,
        jobId: ping.jobId,
        lat: ping.lat,
        lng: ping.lng,
        accuracyM: ping.accuracyM,
        speedMps: ping.speedMps,
        recordedAt: new Date(ping.recordedAt),
      })),
    });

    const newest = usable.reduce((latest, ping) =>
      new Date(ping.recordedAt).getTime() > new Date(latest.recordedAt).getTime() ? ping : latest,
    );
    await this.prisma.rider.update({
      where: { id: rider.id },
      data: { lastLat: newest.lat, lastLng: newest.lng, lastLocationAt: new Date(newest.recordedAt) },
    });

    return { accepted: usable.length, total: dto.pings.length };
  }
}
