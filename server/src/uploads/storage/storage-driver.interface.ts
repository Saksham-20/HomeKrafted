/**
 * The seam between "we stored a file" and "where files actually live".
 *
 * Local disk on the VPS today; object storage (S3/R2/Cloudinary) later
 * without touching a controller, a DTO or a database column. That works
 * because what we persist is the **public URL** the driver hands back, not
 * a driver-specific key or a local path — a row written today
 * (`/uploads/...`) keeps resolving after a swap, and new rows just start
 * carrying an absolute CDN URL instead. Mixed old and new values coexist
 * fine, which is what makes a migration optional rather than a big-bang.
 *
 * Same env-gated shape the WhatsApp/SMS/email providers use: a real driver
 * when configured, a safe default otherwise.
 */

export interface StoredObject {
  /** Driver-owned identifier — a relative path on disk, an object key in a bucket. Persist it only if you need to delete later. */
  key: string;
  /** What goes in the database and into `<img src>`. Relative for local disk, absolute for a CDN. */
  url: string;
  bytes: number;
  mime: string;
}

export interface PutObjectInput {
  body: Buffer;
  /** Sniffed from the bytes, never the client's Content-Type header. */
  mime: string;
  /** Extension matching `mime`, no leading dot. */
  ext: string;
  /**
   * Logical folder, e.g. `sellers/<sellerId>`. Driver-namespaced, never
   * built from user input — see `UploadsService.buildScope`.
   */
  scope: string;
}

export interface StorageDriver {
  readonly name: string;
  put(input: PutObjectInput): Promise<StoredObject>;
  /** Best-effort. Missing objects resolve rather than throw — deleting an already-deleted file is not an error worth propagating. */
  remove(key: string): Promise<void>;
}

export const STORAGE_DRIVER = Symbol('STORAGE_DRIVER');
