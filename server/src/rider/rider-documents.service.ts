import {
  BadRequestException,
  Injectable,
  NotFoundException,
  PayloadTooLargeException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { promises as fs } from 'fs';
import * as path from 'path';
import { RiderDocumentKind } from '@prisma/client';
import { AppConfig } from '../config/configuration';
import { PrismaService } from '../prisma/prisma.service';
import { RequestUser } from '../common/types/jwt-payload.type';
import { sniffImage } from '../uploads/image-type';
import { processImage } from '../uploads/image-pipeline';
import { SELF_UPLOADABLE_DOCUMENT_KINDS } from './required-documents';

export function isSelfUploadableKind(value: string): value is RiderDocumentKind {
  return (SELF_UPLOADABLE_DOCUMENT_KINDS as string[]).includes(value);
}

/**
 * `POST /rider/documents/:kind` — a rider's own KYC/vehicle photo.
 *
 * **Deliberately not `UploadsService`.** That service's `StorageDriver`
 * writes under a *public* root (`local` disk served by nginx, or GCS with
 * a public base URL) — appropriate for a listing photo, wrong for an
 * Aadhaar card. This writes straight to `RIDER_KYC_DIR`, a directory
 * nothing public-facing ever serves from, and hands back **no URL at
 * all** — only `{ kind, status, uploadedAt }`. The only read path is
 * `AdminRidersService#streamDocument`, which opens the file itself and
 * pipes the bytes to an authenticated, scope-gated admin request.
 *
 * The re-encode (`sniffImage` + `processImage`, the same pair
 * `UploadsService` calls) is reused as-is: it strips EXIF, caps
 * dimensions and normalises to WebP — a phone photo of an Aadhaar card
 * carries the same GPS-in-EXIF risk as a kitchen photo, and there is no
 * reason this store should trust file bytes any less than the public one
 * does.
 */
@Injectable()
export class RiderDocumentsService {
  private readonly kycDir: string;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService<AppConfig, true>,
  ) {
    this.kycDir = config.get('rider.kycDir', { infer: true });
  }

  async upload(user: RequestUser, kindParam: string, file: Express.Multer.File | undefined) {
    if (!isSelfUploadableKind(kindParam)) {
      throw new BadRequestException(
        `"${kindParam}" is not a document you can upload here.`,
      );
    }
    const kind = kindParam;

    const rider = await this.prisma.rider.findUnique({ where: { userId: user.userId } });
    if (!rider) {
      throw new NotFoundException('No rider profile found for this account.');
    }

    if (!file?.buffer?.length) {
      throw new BadRequestException('No file was uploaded.');
    }

    // 12MB, same abuse ceiling as the public upload endpoint — nothing
    // this size is ever stored, `processImage` re-encodes every accepted
    // file down to a capped WebP first.
    const maxBytes = 12 * 1024 * 1024;
    if (file.size > maxBytes) {
      throw new PayloadTooLargeException(`Photos must be under ${Math.floor(maxBytes / 1024 / 1024)}MB.`);
    }

    const sniffed = sniffImage(file.buffer);
    if (!sniffed) {
      throw new UnsupportedMediaTypeException('That file is not a JPEG, PNG, WebP or AVIF image.');
    }
    const processed = await processImage(file.buffer, sniffed);

    const existing = await this.prisma.riderDocument.findUnique({
      where: { riderId_kind: { riderId: rider.id, kind } },
    });

    // Path built only from ids/kind/a fresh uuid — never from anything the
    // request supplies as a string, so there is nothing here that can walk
    // outside `kycDir`.
    const storageKey = `${rider.id}/${kind}-${crypto.randomUUID()}.webp`;
    const absolutePath = path.join(this.kycDir, storageKey);
    await fs.mkdir(path.dirname(absolutePath), { recursive: true });
    await fs.writeFile(absolutePath, processed.body);

    const uploadedAt = new Date();
    const saved = await this.prisma.riderDocument.upsert({
      where: { riderId_kind: { riderId: rider.id, kind } },
      create: { riderId: rider.id, kind, storageKey, status: 'pending' },
      // A re-upload replaces the row rather than accumulating a second
      // one (the `@@unique([riderId, kind])` constraint), and goes back
      // to `pending` — a new photo has not been looked at yet, whatever
      // the old one's status was.
      update: {
        storageKey,
        status: 'pending',
        note: null,
        reviewedById: null,
        reviewedAt: null,
        uploadedAt,
      },
    });

    // The old file is deleted only after the new row commits, and best-
    // effort — a stray orphaned file on disk is a cleanup job; deleting
    // the live one before the write that replaces it lands is a way to
    // end up with neither.
    if (existing && existing.storageKey !== storageKey) {
      await fs.rm(path.join(this.kycDir, existing.storageKey), { force: true }).catch(() => undefined);
    }

    return {
      kind: saved.kind,
      status: saved.status,
      uploadedAt: saved.uploadedAt.toISOString(),
    };
  }
}
