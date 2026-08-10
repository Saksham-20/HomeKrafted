import { BadGatewayException, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import * as path from 'path';
import { Storage, type Bucket, type StorageOptions } from '@google-cloud/storage';
import { PutObjectInput, StorageDriver, StoredObject } from './storage-driver.interface';

/**
 * How long a browser may cache an object.
 *
 * Safe at a year because keys are UUIDs: an edited photo is a *new* key,
 * never the same key with new bytes, so nothing addressable ever changes
 * underneath a cache. (The flip side, noted in `docs/DEPLOY.md`: the old
 * object is orphaned rather than replaced, and nothing deletes it yet.)
 */
const CACHE_CONTROL = 'public, max-age=31536000, immutable';

export interface GcsDriverOptions {
  bucket: string;
  /** Origin + optional path the bucket is publicly served from, no trailing slash. */
  publicBaseUrl: string;
  /** Path to a service-account key file, or the parsed key itself. Either, not both. */
  keyFilename?: string;
  credentials?: StorageOptions['credentials'];
  projectId?: string;
}

/**
 * Google Cloud Storage backend for uploads.
 *
 * Slots into the same seam as `LocalDiskDriver`: mint a key, write the
 * bytes, hand back the URL to store. The only visible difference is that
 * the URL is absolute, which every consumer already tolerates —
 * `StoredObject.url` has been documented as "relative for local disk,
 * absolute for a CDN" since the interface was written, and `ImageSlot`
 * decides `unoptimized` structurally rather than by prefix.
 *
 * **Two things a future edit must not undo:**
 *
 * - **`application`-purpose objects must never land in the public
 *   bucket.** That purpose carries FSSAI licences and identity documents.
 *   `UploadsService` keeps them on local disk while this driver is
 *   active; if that changes, they need their own private bucket and
 *   signed URLs, not a shared one with a year-long immutable cache.
 * - **The runtime service account should hold `objectAdmin` on this
 *   bucket and nothing else.** It is reachable from the request path, so
 *   its blast radius is whatever it can reach.
 *
 * Failures map to 502, never a bare 500: a misconfigured bucket is an
 * upstream problem and the message should say so rather than reading as
 * a crash. Credentials are never logged.
 */
export class GcsDriver implements StorageDriver {
  readonly name = 'gcs';
  private readonly logger = new Logger(GcsDriver.name);
  private readonly bucket: Bucket;
  private readonly publicBaseUrl: string;

  constructor(options: GcsDriverOptions, storage?: Storage) {
    this.publicBaseUrl = options.publicBaseUrl.replace(/\/$/, '');
    const client =
      storage ??
      new Storage({
        ...(options.projectId ? { projectId: options.projectId } : {}),
        ...(options.keyFilename ? { keyFilename: options.keyFilename } : {}),
        ...(options.credentials ? { credentials: options.credentials } : {}),
      });
    this.bucket = client.bucket(options.bucket);
  }

  async put({ body, mime, ext, scope }: PutObjectInput): Promise<StoredObject> {
    // Same key shape as the local driver, so a bucket synced from disk
    // lines up object-for-object and the URL rewrite is a prefix swap.
    const key = path.posix.join(scope, `${randomUUID()}.${ext}`);

    try {
      await this.bucket.file(key).save(body, {
        contentType: mime,
        // Resumable uploads add a round trip and are pointless here: the
        // pipeline has already capped every object well under the 5 MB
        // threshold where they start paying off.
        resumable: false,
        metadata: { cacheControl: CACHE_CONTROL },
      });
    } catch (error) {
      throw this.upstreamFailure('store', key, error);
    }

    return {
      key,
      url: `${this.publicBaseUrl}/${key}`,
      bytes: body.byteLength,
      mime,
    };
  }

  async remove(key: string): Promise<void> {
    try {
      // `ignoreNotFound` keeps the interface's promise that deleting an
      // already-deleted object resolves rather than throwing.
      await this.bucket.file(key).delete({ ignoreNotFound: true });
    } catch (error) {
      // Best-effort by contract: a failed cleanup must not fail the
      // request that triggered it. Logged so orphans are traceable.
      this.logger.warn(`Failed to remove ${key} from the bucket: ${describe(error)}`);
    }
  }

  private upstreamFailure(verb: string, key: string, error: unknown): BadGatewayException {
    // The message is logged in full and summarised to the caller. A GCS
    // permission error names the service account and the bucket, which
    // belongs in our logs and not in an HTTP response.
    this.logger.error(`Could not ${verb} ${key} in bucket ${this.bucket.name}: ${describe(error)}`);
    return new BadGatewayException(
      'Image storage is not accepting uploads right now. Try again in a moment.',
    );
  }
}

function describe(error: unknown): string {
  if (error instanceof Error) return `${error.name}: ${error.message}`;
  return String(error);
}
