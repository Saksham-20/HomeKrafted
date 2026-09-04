import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  PayloadTooLargeException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppConfig } from '../config/configuration';
import { RequestUser } from '../common/types/jwt-payload.type';
import { sniffImage } from './image-type';
import { processImage } from './image-pipeline';
import { STORAGE_DRIVER, StorageDriver, StoredObject } from './storage/storage-driver.interface';

/** Where an upload is filed. Not free-form: an unbounded value would let a caller write anywhere under the upload root. */
export type UploadPurpose =
  | 'listing'
  | 'menu'
  | 'storefront'
  | 'application'
  | 'laundry'
  /** Admin-authored occasion/guide cover art (M42). Not seller content: it is platform merchandising, and only an admin route writes it. */
  | 'collection'
  /**
   * A shopper's own profile picture (2026-09-04). Its own purpose rather
   * than reusing `storefront`, because `buildScope` files an upload under
   * `sellerId ?? userId` — a HomeKrafter's profile photo would otherwise
   * land in the same folder as their shop's artwork, which is a different
   * thing owned by a different screen.
   */
  | 'profile';

const PURPOSES: readonly UploadPurpose[] = [
  'listing',
  'menu',
  'storefront',
  'application',
  'laundry',
  'collection',
  'profile',
];

export function isUploadPurpose(value: string): value is UploadPurpose {
  return (PURPOSES as readonly string[]).includes(value);
}

function formatBytes(bytes: number): string {
  return bytes >= 1024 * 1024
    ? `${(bytes / 1024 / 1024).toFixed(1)}MB`
    : `${Math.round(bytes / 1024)}KB`;
}

@Injectable()
export class UploadsService {
  private readonly logger = new Logger(UploadsService.name);
  private readonly maxBytes: number;

  constructor(
    @Inject(STORAGE_DRIVER) private readonly storage: StorageDriver,
    configService: ConfigService<AppConfig, true>,
  ) {
    this.maxBytes = configService.get('uploads.maxBytes', { infer: true });
  }

  /**
   * Validate the bytes, re-encode them, and hand the result to the
   * storage driver.
   *
   * Order matters: size first (cheapest rejection), then the content
   * sniff, then the decode. The multipart layer already caps size, but
   * this runs the check again rather than assuming — the limit lives in
   * one place and the service is the thing that must not be bypassable.
   *
   * **What reaches the driver is never what was uploaded.** Everything is
   * re-encoded to a stripped, size-capped WebP first (`image-pipeline.ts`),
   * so the sniffed type decides only whether we accept the file, not what
   * gets stored. That is also the boundary that removes EXIF GPS from a
   * home cook's photo, so it is not skippable for any purpose.
   */
  async storeImage(
    file: Express.Multer.File | undefined,
    purpose: UploadPurpose,
    user: RequestUser,
  ): Promise<StoredObject> {
    if (!file?.buffer?.length) {
      throw new BadRequestException('No file was uploaded.');
    }

    if (file.size > this.maxBytes) {
      throw new PayloadTooLargeException(
        `Images must be under ${Math.floor(this.maxBytes / 1024 / 1024)}MB.`,
      );
    }

    // The declared mime and the filename are both caller-supplied; only
    // the bytes are evidence. See `image-type.ts`.
    const sniffed = sniffImage(file.buffer);
    if (!sniffed) {
      throw new UnsupportedMediaTypeException(
        'That file is not a JPEG, PNG, WebP or AVIF image.',
      );
    }

    const processed = await processImage(file.buffer, sniffed);

    const stored = await this.storage.put({
      body: processed.body,
      mime: processed.mime,
      ext: processed.ext,
      scope: this.buildScope(purpose, user),
    });

    this.logger.log(
      `Stored ${stored.key} — ${sniffed.ext} ${formatBytes(processed.originalBytes)} ` +
        `-> webp ${formatBytes(stored.bytes)} at ${processed.width}x${processed.height}`,
    );

    return stored;
  }

  remove(key: string): Promise<void> {
    return this.storage.remove(key);
  }

  /**
   * Folder for an upload, built only from a closed set of purposes and
   * ids the server minted at login — never from the request body. That is
   * what keeps `scope` from being a path-traversal vector: there is no
   * caller-supplied string in it.
   */
  private buildScope(purpose: UploadPurpose, user: RequestUser): string {
    const owner = user.sellerId ?? user.userId;
    return `${purpose}/${owner}`;
  }
}
