import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RequestUser } from '../common/types/jwt-payload.type';
import { UploadsService } from '../uploads/uploads.service';
import { RiderOnboardingService } from './rider.service';
import { RiderSettingsService } from './rider-settings.service';
import { DeliveryOrderReconcileService } from './delivery-order-reconcile.service';
import { payFor } from './rider-pay';
import { distanceMetres } from './geofence';
import { isOtpLocked, otpMatches, LOCKED_SENTENCE, MAX_OTP_ATTEMPTS } from './otp-lock';
import { JOB_WITH_RELATIONS_INCLUDE, JobWithRelations } from './rider-jobs.types';
import { mapActiveJobForRider, mapJobHistoryForRider } from './rider-jobs.mapper';
import { ArrivedDto } from './dto/arrived.dto';
import { DeliverJobDto } from './dto/deliver-job.dto';
import { FailJobDto } from './dto/fail-job.dto';

function formatMetres(m: number): string {
  return m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`;
}

/**
 * Every `/rider/jobs/*` route — §2.3's delivery journey, one guarded
 * `updateMany({ where: { status: from } })` per step (the R2
 * cross-cutting rule), each checking ownership first
 * (`ownJob` — never a job id alone).
 */
@Injectable()
export class RiderJobsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly riders: RiderOnboardingService,
    private readonly uploads: UploadsService,
    private readonly settings: RiderSettingsService,
    private readonly reconcile: DeliveryOrderReconcileService,
  ) {}

  private async ownJob(riderId: string, jobId: string): Promise<JobWithRelations> {
    const job = await this.prisma.deliveryJob.findUnique({ where: { id: jobId }, include: JOB_WITH_RELATIONS_INCLUDE });
    if (!job || job.riderId !== riderId) throw new NotFoundException('Delivery not found.');
    return job;
  }

  async active(user: RequestUser) {
    const rider = await this.riders.resolveRider(user);
    const job = await this.prisma.deliveryJob.findFirst({
      where: { riderId: rider.id, status: { in: ['accepted', 'at_pickup', 'picked_up', 'at_drop'] } },
      include: JOB_WITH_RELATIONS_INCLUDE,
    });
    return job ? mapActiveJobForRider(job) : null;
  }

  async history(user: RequestUser, page = 1, pageSize = 20) {
    const rider = await this.riders.resolveRider(user);
    const where = { riderId: rider.id };
    const [rows, total] = await Promise.all([
      this.prisma.deliveryJob.findMany({
        where,
        include: JOB_WITH_RELATIONS_INCLUDE,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.deliveryJob.count({ where }),
    ]);
    return { items: rows.map(mapJobHistoryForRider), page, pageSize, total };
  }

  async arrivedPickup(user: RequestUser, jobId: string, dto: ArrivedDto) {
    const rider = await this.riders.resolveRider(user);
    const job = await this.ownJob(rider.id, jobId);
    if (job.status !== 'accepted') {
      throw new ConflictException(`This delivery is "${job.status}" — arrival can only be recorded right after accepting.`);
    }

    const settings = await this.settings.get();
    const distance = distanceMetres({ lat: dto.lat, lng: dto.lng }, { lat: job.pickupLat, lng: job.pickupLng });
    if (distance > settings.arriveRadiusM) {
      throw new BadRequestException(`You are ${formatMetres(distance)} from the kitchen — tap Arrived when you are there.`);
    }

    const result = await this.prisma.deliveryJob.updateMany({
      where: { id: jobId, status: 'accepted' },
      data: { status: 'at_pickup', arrivedPickupAt: new Date() },
    });
    if (result.count !== 1) throw new ConflictException('This delivery has already moved on.');
    return this.active(user);
  }

  async pickupPhoto(user: RequestUser, jobId: string, file: Express.Multer.File | undefined) {
    const rider = await this.riders.resolveRider(user);
    const job = await this.ownJob(rider.id, jobId);
    if (job.status !== 'at_pickup') {
      throw new ConflictException(`This delivery is "${job.status}" — a pickup photo belongs to the pickup step.`);
    }
    const stored = await this.uploads.storeImage(file, 'delivery', user);
    await this.prisma.deliveryProof.create({
      data: { jobId, stage: 'pickup_rider', url: stored.url, uploadedById: user.userId },
    });
    return { stage: 'pickup_rider' as const, url: stored.url };
  }

  async pickedUp(user: RequestUser, jobId: string) {
    const rider = await this.riders.resolveRider(user);
    const job = await this.ownJob(rider.id, jobId);
    if (job.status !== 'at_pickup') {
      throw new ConflictException(`This delivery is "${job.status}" — mark it picked up only from the pickup step.`);
    }

    const hasProof = await this.prisma.deliveryProof.findFirst({ where: { jobId, stage: 'pickup_rider' } });
    if (!hasProof) {
      throw new BadRequestException('Take a photo of the parcel before marking it picked up.');
    }

    const now = new Date();
    const settings = await this.settings.get();
    const waitMinutes = job.arrivedPickupAt ? (now.getTime() - job.arrivedPickupAt.getTime()) / 60000 : 0;
    const pay = payFor({ distanceKm: job.distanceKm ?? 0, waitMinutes, settings });

    const result = await this.prisma.deliveryJob.updateMany({
      where: { id: jobId, status: 'at_pickup' },
      data: {
        status: 'picked_up',
        pickedUpAt: now,
        basePay: pay.basePay / 100,
        distancePay: pay.distancePay / 100,
        waitPay: pay.waitPay / 100,
        totalPay: pay.totalPay / 100,
      },
    });
    if (result.count !== 1) throw new ConflictException('This delivery has already moved on.');

    await this.reconcile.reconcile(job.orderId);
    return this.active(user);
  }

  async arrivedDrop(user: RequestUser, jobId: string, dto: ArrivedDto) {
    const rider = await this.riders.resolveRider(user);
    const job = await this.ownJob(rider.id, jobId);
    if (job.status !== 'picked_up') {
      throw new ConflictException(`This delivery is "${job.status}" — drop arrival can only be recorded once you're carrying it.`);
    }

    const settings = await this.settings.get();
    const distance = distanceMetres({ lat: dto.lat, lng: dto.lng }, { lat: job.dropLat, lng: job.dropLng });
    if (distance > settings.arriveRadiusM) {
      throw new BadRequestException(`You are ${formatMetres(distance)} from the drop address — tap Arrived when you are there.`);
    }

    const result = await this.prisma.deliveryJob.updateMany({
      where: { id: jobId, status: 'picked_up' },
      data: { status: 'at_drop', arrivedDropAt: new Date() },
    });
    if (result.count !== 1) throw new ConflictException('This delivery has already moved on.');
    return this.active(user);
  }

  async dropPhoto(user: RequestUser, jobId: string, file: Express.Multer.File | undefined) {
    const rider = await this.riders.resolveRider(user);
    const job = await this.ownJob(rider.id, jobId);
    if (job.status !== 'at_drop') {
      throw new ConflictException(`This delivery is "${job.status}" — a drop photo belongs to the drop step.`);
    }
    const stored = await this.uploads.storeImage(file, 'delivery', user);
    await this.prisma.deliveryProof.create({ data: { jobId, stage: 'drop', url: stored.url, uploadedById: user.userId } });
    return { stage: 'drop' as const, url: stored.url };
  }

  async failedPhoto(user: RequestUser, jobId: string, file: Express.Multer.File | undefined) {
    const rider = await this.riders.resolveRider(user);
    const job = await this.ownJob(rider.id, jobId);
    if (job.status !== 'at_drop') {
      throw new ConflictException(`This delivery is "${job.status}" — a failed-attempt photo belongs to the drop step.`);
    }
    const stored = await this.uploads.storeImage(file, 'delivery', user);
    await this.prisma.deliveryProof.create({
      data: { jobId, stage: 'failed_attempt', url: stored.url, uploadedById: user.userId },
    });
    return { stage: 'failed_attempt' as const, url: stored.url };
  }

  /**
   * `POST /rider/jobs/:id/deliver` — compares the buyer's OTP in constant
   * time (`otpMatches`), locks the job to support after
   * `MAX_OTP_ATTEMPTS` wrong guesses, and writes the `cod_collected`
   * ledger entry (D8 — a ledger row, never a counter) when cash actually
   * changed hands.
   */
  async deliver(user: RequestUser, jobId: string, dto: DeliverJobDto) {
    const rider = await this.riders.resolveRider(user);
    const job = await this.ownJob(rider.id, jobId);
    if (job.status !== 'at_drop') {
      throw new ConflictException(`This delivery is "${job.status}" — it can only be delivered from the drop step.`);
    }

    const hasProof = await this.prisma.deliveryProof.findFirst({ where: { jobId, stage: 'drop' } });
    if (!hasProof) {
      throw new BadRequestException('Take a drop photo before marking this delivered.');
    }

    const candidate = dto.otp.trim();

    // The lock check and the attempt increment have to serialise on the
    // same row, or concurrent /deliver requests each read a stale
    // `otpAttempts`, all pass the lock check, and all get to compare a
    // guess before any of their increments land — turning the 5-guess
    // ceiling into "5 guesses per wave of concurrent requests". `FOR
    // UPDATE` inside a transaction is the same row-lock pattern
    // `meal-subscriptions.service.ts`'s capacity check and
    // `payments.service.ts`'s order lock use for this exact class of race.
    const wrongGuess = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "DeliveryJob" WHERE id = ${jobId} FOR UPDATE`;
      const current = await tx.deliveryJob.findUniqueOrThrow({ where: { id: jobId } });
      if (isOtpLocked(current.otpAttempts)) {
        throw new ConflictException(current.failureReason ?? LOCKED_SENTENCE);
      }
      if (current.deliveryOtp && otpMatches(candidate, current.deliveryOtp)) {
        return null;
      }
      const attempts = current.otpAttempts + 1;
      const locked = isOtpLocked(attempts);
      await tx.deliveryJob.update({
        where: { id: jobId },
        data: { otpAttempts: attempts, ...(locked ? { failureReason: LOCKED_SENTENCE } : {}) },
      });
      return { attempts, locked };
    });

    if (wrongGuess) {
      if (wrongGuess.locked) throw new ConflictException(LOCKED_SENTENCE);
      const left = MAX_OTP_ATTEMPTS - wrongGuess.attempts;
      throw new BadRequestException(`That code doesn't match. ${left} attempt${left === 1 ? '' : 's'} left.`);
    }

    const now = new Date();
    const result = await this.prisma.deliveryJob.updateMany({
      where: { id: jobId, status: 'at_drop' },
      data: { status: 'delivered', deliveredAt: now },
    });
    if (result.count !== 1) throw new ConflictException('This delivery has already moved on.');

    if (dto.cashCollected && job.codAmount) {
      await this.prisma.riderCashEntry.create({
        data: {
          riderId: rider.id,
          type: 'cod_collected',
          amount: job.codAmount,
          jobId,
          note: `Collected on delivery of ${job.jobNumber}`,
        },
      });
    }

    await this.reconcile.reconcile(job.orderId);
    return this.active(user);
  }

  async fail(user: RequestUser, jobId: string, dto: FailJobDto) {
    const rider = await this.riders.resolveRider(user);
    const job = await this.ownJob(rider.id, jobId);
    if (job.status !== 'at_drop') {
      throw new ConflictException(`This delivery is "${job.status}" — a failed attempt is recorded from the drop step.`);
    }

    const hasProof = await this.prisma.deliveryProof.findFirst({ where: { jobId, stage: 'failed_attempt' } });
    if (!hasProof) {
      throw new BadRequestException('Take a photo of the door before recording a failed attempt.');
    }

    const result = await this.prisma.deliveryJob.updateMany({
      where: { id: jobId, status: 'at_drop' },
      data: { status: 'failed', failureReason: dto.reason },
    });
    if (result.count !== 1) throw new ConflictException('This delivery has already moved on.');
    return this.active(user);
  }
}
