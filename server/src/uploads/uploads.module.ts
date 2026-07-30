import { Logger, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AppConfig } from '../config/configuration';
import { LocalDiskDriver } from './storage/local-disk.driver';
import { STORAGE_DRIVER, StorageDriver } from './storage/storage-driver.interface';
import { UploadsController } from './uploads.controller';
import { UploadsService } from './uploads.service';

/**
 * Picks the storage backend from `STORAGE_DRIVER`.
 *
 * **Adding a cloud driver later:** write a class implementing
 * `StorageDriver` (S3, R2, Cloudinary — the interface is four fields and
 * two methods), add a `case` here, and set `STORAGE_DRIVER` on the box.
 * Nothing else changes: controllers, DTOs and database columns all deal
 * in the URL the driver returns, so rows written by the old driver keep
 * resolving alongside rows written by the new one.
 *
 * An unrecognised value throws instead of falling back to local disk. A
 * silent fallback would be the worst outcome — uploads would appear to
 * succeed on a box that was meant to be writing to a bucket, and nobody
 * would notice until the disk filled or the box was replaced.
 */
function createStorageDriver(config: ConfigService<AppConfig, true>): StorageDriver {
  const driver = config.get('uploads.driver', { infer: true });
  const logger = new Logger('StorageDriver');

  switch (driver) {
    case 'local': {
      const dir = config.get('uploads.dir', { infer: true });
      const prefix = config.get('uploads.publicPrefix', { infer: true });
      logger.log(`Using local disk storage at ${dir} (served from ${prefix}/)`);
      return new LocalDiskDriver(dir, prefix);
    }
    default:
      throw new Error(
        `Unknown STORAGE_DRIVER "${driver}". Supported: "local". ` +
          'To add cloud storage, implement StorageDriver and register it in UploadsModule.',
      );
  }
}

@Module({
  imports: [ConfigModule],
  controllers: [UploadsController],
  providers: [
    UploadsService,
    {
      provide: STORAGE_DRIVER,
      inject: [ConfigService],
      useFactory: createStorageDriver,
    },
  ],
  exports: [UploadsService],
})
export class UploadsModule {}
