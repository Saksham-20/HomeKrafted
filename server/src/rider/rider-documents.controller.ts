import { Controller, Param, Post, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RequestUser } from '../common/types/jwt-payload.type';
import { RiderDocumentsService } from './rider-documents.service';

/**
 * Hard ceiling for the multipart parser — same reasoning and same value
 * as `UploadsController`'s: multer aborts the stream here so a huge body
 * never gets buffered while `RiderDocumentsService` decides about it.
 */
const MULTIPART_HARD_LIMIT_BYTES = 15 * 1024 * 1024;

@Controller('rider/documents')
@Roles('rider')
export class RiderDocumentsController {
  constructor(private readonly documents: RiderDocumentsService) {}

  @Post(':kind')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: MULTIPART_HARD_LIMIT_BYTES, files: 1 },
    }),
  )
  upload(
    @CurrentUser() user: RequestUser,
    @Param('kind') kind: string,
    @UploadedFile() file: Express.Multer.File | undefined,
  ) {
    return this.documents.upload(user, kind, file);
  }
}
