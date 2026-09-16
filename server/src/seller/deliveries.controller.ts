import { Controller, Param, Post, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RequestUser } from '../common/types/jwt-payload.type';
import { SellerService } from './seller.service';
import { SellerDeliveriesService } from './deliveries.service';

const MULTIPART_HARD_LIMIT_BYTES = 15 * 1024 * 1024;

/** `/seller/deliveries/*` — a HomeKrafter's own side of §2.3's pickup handover. */
@Controller('seller/deliveries')
@Roles('seller')
export class SellerDeliveriesController {
  constructor(
    private readonly sellerService: SellerService,
    private readonly deliveries: SellerDeliveriesService,
  ) {}

  @Post(':jobId/handover-photo')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: MULTIPART_HARD_LIMIT_BYTES, files: 1 } }))
  async handoverPhoto(
    @CurrentUser() user: RequestUser,
    @Param('jobId') jobId: string,
    @UploadedFile() file: Express.Multer.File | undefined,
  ) {
    const seller = await this.sellerService.resolveHomeKrafter(user);
    return this.deliveries.handoverPhoto(user, seller.vendorId, jobId, file);
  }
}
