import { API_BASE_URL, ApiError } from "./http";
import { getAccessToken } from "@/lib/auth/session";

/**
 * Where the image is filed — must match `UploadPurpose` in
 * `server/src/uploads/uploads.service.ts`. `"laundry"` left this union in
 * M37 (no screen can create a laundry photo any more); the server still
 * accepts it so a native client built against the old set isn't broken.
 */
/**
 * Closed set, and it must match `server/src/uploads/uploads.service.ts`
 * — the purpose decides the storage folder, so it can never be
 * free-form. Adding one means adding it in both files.
 *
 * `collection` is admin-authored occasion/guide cover art (M42).
 */
export type UploadPurpose = "listing" | "menu" | "storefront" | "application" | "collection";

export interface UploadedImage {
  /** What to persist and render. Relative (`/uploads/...`) on local-disk storage, absolute once a CDN driver is in use. */
  url: string;
  /** Storage-driver key — hand it back to delete the object later. */
  key: string;
  bytes: number;
  mime: string;
}

/** Accepted by the server's byte sniffer. Mirrored into the file picker's `accept`. */
export const ACCEPTED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/avif"];

/**
 * What the copy promises, in MB. Must match `UPLOAD_MAX_BYTES` on the
 * server — this is display only, the limit that binds is enforced there.
 *
 * Raised from 5 once the server started re-encoding every upload
 * (`server/src/uploads/image-pipeline.ts`). 5MB rejected a routine photo
 * straight off a modern phone, which on a platform being onboarded by home
 * cooks photographing their own food meant the *first* thing a new
 * HomeKrafter did on the site failed. What lands on disk is a capped WebP
 * of a few hundred KB whatever arrives, so the input limit exists to stop
 * abuse, not to manage storage.
 */
export const MAX_UPLOAD_MB = 12;

/**
 * Upload one image.
 *
 * **Not on `http.ts`.** That helper JSON-encodes bodies and sets
 * `Content-Type: application/json`; multipart needs the browser to set the
 * header itself so it can include the boundary. It also uses `fetch`,
 * which cannot report upload progress — and on a phone on mobile data,
 * "is this doing anything?" is the whole question a photo upload has to
 * answer. Hence `XMLHttpRequest`, which still exposes `upload.onprogress`.
 *
 * A 401 is not retried here. `http.ts`'s refresh dance exists for reads
 * that fire on mount; an upload is a deliberate action a signed-out user
 * shouldn't have reached, so it surfaces as an error rather than silently
 * re-authenticating mid-file.
 */
export function uploadImage(
  file: File,
  purpose: UploadPurpose,
  options: { onProgress?: (percent: number) => void; signal?: AbortSignal } = {},
): Promise<UploadedImage> {
  const { onProgress, signal } = options;

  return new Promise<UploadedImage>((resolve, reject) => {
    const form = new FormData();
    form.append("file", file);

    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${API_BASE_URL}/uploads?purpose=${encodeURIComponent(purpose)}`);

    const token = getAccessToken();
    if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);

    if (onProgress) {
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          onProgress(Math.round((event.loaded / event.total) * 100));
        }
      };
    }

    xhr.onload = () => {
      let parsed: unknown;
      try {
        parsed = xhr.responseText ? JSON.parse(xhr.responseText) : undefined;
      } catch {
        parsed = undefined;
      }

      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(parsed as UploadedImage);
        return;
      }

      // Same `{ error: { code, message } }` envelope as every other
      // endpoint, so callers can branch on `code` — `FILE_TOO_LARGE` and
      // `UNSUPPORTED_IMAGE` are the two worth handling by name.
      const envelope = parsed as { error?: { code?: string; message?: string } } | undefined;
      reject(
        new ApiError(
          xhr.status,
          envelope?.error?.code ?? "ERROR",
          envelope?.error?.message ?? `Upload failed (${xhr.status})`,
        ),
      );
    };

    xhr.onerror = () =>
      reject(new ApiError(0, "NETWORK_ERROR", "Upload failed — check your connection."));
    xhr.onabort = () => reject(new ApiError(0, "ABORTED", "Upload cancelled."));

    if (signal) {
      if (signal.aborted) {
        reject(new ApiError(0, "ABORTED", "Upload cancelled."));
        return;
      }
      signal.addEventListener("abort", () => xhr.abort(), { once: true });
    }

    xhr.send(form);
  });
}
