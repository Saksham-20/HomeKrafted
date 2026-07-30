import {
  BadRequestException,
  Controller,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import { memoryStorage } from 'multer';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequestUser } from '../common/types/jwt-payload.type';
import { isUploadPurpose, UploadsService } from './uploads.service';

/**
 * Hard ceiling for the multipart parser, deliberately above
 * `UPLOAD_MAX_BYTES`. Multer aborts the stream here so a multi-gigabyte
 * body can't be buffered into memory while we decide about it; the real,
 * configurable limit is enforced in `UploadsService`, which is the layer
 * that must not be bypassable.
 *
 * Read at import time (a decorator argument), so it can't come from
 * `ConfigService` — same constraint documented on `AuthController`'s
 * throttle constants.
 */
const MULTIPART_HARD_LIMIT_BYTES = 15 * 1024 * 1024;

/**
 * Uploads are cheap to request and expensive to serve, and every accepted
 * one costs disk that nothing currently reclaims. Tighter than the global
 * limit for that reason.
 */
const UPLOAD_THROTTLE = {
  default: {
    limit: parseInt(process.env.THROTTLE_UPLOAD_LIMIT ?? '30', 10),
    ttl: parseInt(process.env.THROTTLE_UPLOAD_TTL_SECONDS ?? '60', 10) * 1000,
  },
};

/**
 * `POST /uploads?purpose=…` — one endpoint for every image the app takes.
 *
 * Authenticated by the global `JwtAuthGuard` (no `@Public()` here): an
 * open upload endpoint is free file hosting for anyone who finds it. Not
 * `@Roles('seller')` though — buyers upload too, on the dry-clean booking
 * flow — so authorization is "a real session", and `purpose` + the
 * caller's own id decide where the bytes land.
 */
@Controller('uploads')
export class UploadsController {
  constructor(private readonly uploadsService: UploadsService) {}

  @Post()
  @Throttle(UPLOAD_THROTTLE)
  @UseInterceptors(
    FileInterceptor('file', {
      // In-memory: the bytes have to be inspected before they are allowed
      // to become a file, and multer's disk storage would have already
      // written them by the time we look (see `image-type.ts`).
      storage: memoryStorage(),
      limits: { fileSize: MULTIPART_HARD_LIMIT_BYTES, files: 1 },
    }),
  )
  async upload(
    @UploadedFile() file: Express.Multer.File | undefined,
    @Query('purpose') purpose: string | undefined,
    @CurrentUser() user: RequestUser,
  ) {
    if (!purpose || !isUploadPurpose(purpose)) {
      throw new BadRequestException(
        'A valid `purpose` query parameter is required.',
      );
    }

    const stored = await this.uploadsService.storeImage(file, purpose, user);

    // `key` is intentionally returned: a caller that replaces an image can
    // hand it back for cleanup. `url` is the value that gets persisted.
    return {
      url: stored.url,
      key: stored.key,
      bytes: stored.bytes,
      mime: stored.mime,
    };
  }
}
