import { randomUUID } from 'node:crypto';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Logger } from '@nestjs/common';
import {
  PutObjectInput,
  StorageDriver,
  StoredObject,
} from './storage-driver.interface';

/**
 * Writes to a directory on the box; nginx serves it straight from disk at
 * `publicPrefix` (see `docs/DEPLOY.md`), so uploaded images never touch
 * Node on the read path.
 *
 * **`baseDir` must live outside the git clone.** `scripts/deploy.sh` runs
 * `git merge --ff-only` in the app root on every deploy, and the clone is
 * disposable — anything written inside it is one `git clean` away from
 * being gone. `/var/lib/homekrafted/uploads` is the default for that
 * reason, not a taste preference.
 *
 * **Filenames are generated, never derived from the upload.** A client
 * filename is attacker-controlled: `../../etc/nginx/nginx.conf`,
 * `shell.php`, a 4KB unicode name, or a name that collides with someone
 * else's file. A UUID plus a sniffed extension has none of those problems,
 * and the original name is not worth keeping for an image.
 */
export class LocalDiskDriver implements StorageDriver {
  readonly name = 'local';
  private readonly logger = new Logger(LocalDiskDriver.name);

  constructor(
    private readonly baseDir: string,
    /** URL prefix nginx maps to `baseDir`. */
    private readonly publicPrefix: string,
  ) {}

  async put({ body, mime, ext, scope }: PutObjectInput): Promise<StoredObject> {
    const key = path.posix.join(scope, `${randomUUID()}.${ext}`);
    const absolute = path.join(this.baseDir, key);

    await mkdir(path.dirname(absolute), { recursive: true });
    await writeFile(absolute, body);

    return {
      key,
      url: `${this.publicPrefix}/${key}`,
      bytes: body.byteLength,
      mime,
    };
  }

  async remove(key: string): Promise<void> {
    // Re-resolve and re-check containment rather than trusting `key`.
    // Keys we mint are safe by construction, but this method is reachable
    // with a stored value, and a `..` slipping through would delete an
    // arbitrary file as root. Cheap insurance at the boundary.
    const absolute = path.resolve(this.baseDir, key);
    const root = path.resolve(this.baseDir);
    if (absolute !== root && !absolute.startsWith(root + path.sep)) {
      this.logger.warn(`Refusing to remove a key outside the upload root: ${key}`);
      return;
    }

    try {
      await unlink(absolute);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException)?.code;
      if (code !== 'ENOENT') {
        this.logger.warn(`Failed to remove ${key}: ${String(error)}`);
      }
    }
  }
}
