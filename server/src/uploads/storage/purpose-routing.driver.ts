import { Logger } from '@nestjs/common';
import { PutObjectInput, StorageDriver, StoredObject } from './storage-driver.interface';

/**
 * Scope prefixes that must never reach a public bucket.
 *
 * `UploadsService.buildScope` produces `${purpose}/${ownerId}`, so the
 * purpose is the first path segment. `application` is the one that
 * matters: it carries FSSAI licences and identity documents submitted by
 * people applying to sell. Those are not catalogue photos, and a public
 * object with a year-long immutable cache is a permanent, guessable-free
 * but permanently-addressable copy of somebody's ID.
 *
 * Kept as data rather than an `if` so adding a second sensitive purpose
 * is one line and cannot be half-done.
 */
const PRIVATE_SCOPE_PREFIXES = ['application/'];

/**
 * Sends sensitive uploads to one backend and everything else to another.
 *
 * Composition rather than a flag inside each driver: `GcsDriver` should
 * not need to know what an FSSAI licence is, and `LocalDiskDriver` should
 * not grow a "but not this one" branch. This wrapper is the only thing
 * that knows the routing rule, and `UploadsService` stays unaware there
 * is more than one backend at all.
 *
 * Used when `STORAGE_DRIVER=gcs`: catalogue imagery goes to the public
 * bucket, application documents stay on the box's disk behind nginx,
 * exactly as they were before the cloud switch. When a private bucket
 * with signed URLs exists, `sensitive` becomes that driver and nothing
 * else here changes.
 */
export class PurposeRoutingDriver implements StorageDriver {
  readonly name: string;
  private readonly logger = new Logger(PurposeRoutingDriver.name);

  constructor(
    private readonly general: StorageDriver,
    private readonly sensitive: StorageDriver,
  ) {
    this.name = `${general.name}+${sensitive.name}`;
  }

  put(input: PutObjectInput): Promise<StoredObject> {
    return this.driverFor(input.scope).put(input);
  }

  /**
   * Remove from whichever backend holds it.
   *
   * The key alone does not say which one wrote it — but it starts with
   * the scope, so the same rule that routed the write routes the delete.
   */
  async remove(key: string): Promise<void> {
    await this.driverFor(key).remove(key);
  }

  private driverFor(scopeOrKey: string): StorageDriver {
    const isSensitive = PRIVATE_SCOPE_PREFIXES.some((p) => scopeOrKey.startsWith(p));
    if (isSensitive) {
      this.logger.debug?.(`Routing ${scopeOrKey} to ${this.sensitive.name} (sensitive purpose)`);
    }
    return isSensitive ? this.sensitive : this.general;
  }
}
