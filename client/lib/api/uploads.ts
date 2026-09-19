import { API_BASE_URL, ApiError, refreshSessionNow } from "./http";
import { getAccessToken, isAccessTokenStale } from "@/lib/auth/session";

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
export type UploadPurpose =
  | "listing"
  | "menu"
  | "storefront"
  | "application"
  | "collection"
  /** A shopper's own profile picture (2026-09-04) — mirrors the server's closed set. */
  | "profile"
  /**
   * R2 (docs/RIDER-APP.md) — a rider's delivery-proof photo (pickup,
   * drop, failed attempt) and a HomeKrafter's parcel handover shot. Not
   * used by any `client/` screen today (the rider app is `rider/`, a
   * separate package that does not compile this file) — added here only
   * to keep this union matching the server's closed set, per this file's
   * own rule above.
   */
  | "delivery";

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
 * A token that is safe to put on the upload, or a reason it cannot be.
 *
 * Goes through `http.ts`'s one refresh — the same lock, the same re-read of
 * storage, the same three-way answer — so an upload cannot spend a refresh
 * token another tab already rotated, and cannot end a session on a request
 * that merely failed to complete.
 *
 * **It never clears the session, whatever the outcome.** `unavailable` is
 * not an answer. `rejected` is one, but this is the wrong place to act on
 * it: the person is on a form with a photo half-attached, and a redirect
 * from here would throw the form away. The next ordinary request runs the
 * same refresh, gets the same refusal, and sends them to sign in.
 */
async function tokenAfterRefresh(): Promise<string> {
  const outcome = await refreshSessionNow();
  if (outcome === "ok") {
    const token = getAccessToken();
    if (token) return token;
  }
  if (outcome === "unavailable") {
    throw new ApiError(
      0,
      "SESSION_UNVERIFIED",
      "We couldn't check your sign-in just now, so the photo wasn't sent. Try again in a moment.",
    );
  }
  throw new ApiError(401, "UNAUTHORIZED", "Your session expired — sign in again.");
}

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
 * **It refreshes the access token, which it did not until 2026-09-19.** The
 * old note here said a 401 was "not retried" because an upload is a
 * deliberate action a signed-out user shouldn't have reached. That reads
 * fine and is wrong for the people who actually hit it: an admin who spends
 * more than the 15-minute access-token lifetime on a listing form is
 * perfectly signed in, and their first photo upload got the server's bare
 * "Invalid or expired access token" — which looks exactly like being logged
 * out. So the token is refreshed up front when it is about to expire, and
 * once more on a 401 (a token revoked or rotated since, another tab having
 * refreshed). Not a loop: one retry, and only when a token was sent.
 */
export async function uploadImage(
  file: File,
  purpose: UploadPurpose,
  options: { onProgress?: (percent: number) => void; signal?: AbortSignal } = {},
): Promise<UploadedImage> {
  let token = getAccessToken();
  if (token && isAccessTokenStale(token)) token = await tokenAfterRefresh();

  try {
    return await sendUpload(file, purpose, token, options);
  } catch (error) {
    if (!(error instanceof ApiError) || error.status !== 401 || !token) throw error;
    return sendUpload(file, purpose, await tokenAfterRefresh(), options);
  }
}

/** One XHR round trip with the given token. Multipart, so not `http.ts` — see `uploadImage`. */
function sendUpload(
  file: File,
  purpose: UploadPurpose,
  token: string | null,
  options: { onProgress?: (percent: number) => void; signal?: AbortSignal },
): Promise<UploadedImage> {
  const { onProgress, signal } = options;

  return new Promise<UploadedImage>((resolve, reject) => {
    const form = new FormData();
    form.append("file", file);

    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${API_BASE_URL}/uploads?purpose=${encodeURIComponent(purpose)}`);

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
