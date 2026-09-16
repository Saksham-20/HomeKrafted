import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RequestUser } from '../common/types/jwt-payload.type';
import { UploadsService } from '../uploads/uploads.service';

/** `POST /seller/deliveries/:jobId/handover-photo` — the kitchen's own proof it handed the parcel to the rider (§2.3's `DeliveryProof(pickup_chef)`). */
@Injectable()
export class SellerDeliveriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly uploads: UploadsService,
  ) {}

  async handoverPhoto(user: RequestUser, vendorId: string, jobId: string, file: Express.Multer.File | undefined) {
    const job = await this.prisma.deliveryJob.findUnique({ where: { id: jobId } });
    if (!job || job.vendorId !== vendorId) {
      throw new NotFoundException('Delivery not found.');
    }
    if (job.status !== 'accepted' && job.status !== 'at_pickup') {
      throw new ConflictException(`This delivery is "${job.status}" — a handover photo belongs to the pickup step.`);
    }

    const stored = await this.uploads.storeImage(file, 'delivery', user);
    await this.prisma.deliveryProof.create({
      data: { jobId, stage: 'pickup_chef', url: stored.url, uploadedById: user.userId },
    });
    return { stage: 'pickup_chef' as const, url: stored.url };
  }
}
