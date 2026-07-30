import {
  BadRequestException,
  Inject,
  Injectable,
  PayloadTooLargeException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppConfig } from '../config/configuration';
import { RequestUser } from '../common/types/jwt-payload.type';
import { sniffImage } from './image-type';
import { STORAGE_DRIVER, StorageDriver, StoredObject } from './storage/storage-driver.interface';

/** Where an upload is filed. Not free-form: an unbounded value would let a caller write anywhere under the upload root. */
export type UploadPurpose = 'listing' | 'menu' | 'storefront' | 'application' | 'laundry';

const PURPOSES: readonly UploadPurpose[] = [
  'listing',
  'menu',
  'storefront',
  'application',
  'laundry',
];

export function isUploadPurpose(value: string): value is UploadPurpose {
  return (PURPOSES as readonly string[]).includes(value);
}

@Injectable()
export class UploadsService {
  private readonly maxBytes: number;

  constructor(
    @Inject(STORAGE_DRIVER) private readonly storage: StorageDriver,
    configService: ConfigService<AppConfig, true>,
  ) {
    this.maxBytes = configService.get('uploads.maxBytes', { infer: true });
  }

  /**
   * Validate the bytes and hand them to the storage driver.
   *
   * Order matters: size first (cheapest rejection), then the content
   * sniff. The multipart layer already caps size, but this runs the check
   * again rather than assuming — the limit lives in one place and the
   * service is the thing that must not be bypassable.
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

    return this.storage.put({
      body: file.buffer,
      mime: sniffed.mime,
      ext: sniffed.ext,
      scope: this.buildScope(purpose, user),
    });
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
