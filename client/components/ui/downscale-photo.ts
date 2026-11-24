/**
 * Shrink a phone photo to the server's own ceiling before it is uploaded.
 *
 * The server stores nothing larger than 2000px on the long edge
 * (`server/src/uploads/image-pipeline.ts` `MAX_EDGE`), so the other 60–80%
 * of a 12-megapixel JPEG crossed a mobile connection only to be thrown
 * away. Resizing here first turns a 4–6 MB upload into well under 1 MB.
 *
 * JPEG only, on purpose: a PNG or WebP may carry transparency that a JPEG
 * re-encode would paint black, and phone cameras produce JPEG (iOS converts
 * HEIC on the way into a file input). Anything that fails — no
 * `createImageBitmap`, a decode error, a result no smaller — sends the
 * original, because the server's byte sniffer and pipeline remain the
 * authority either way.
 *
 * Lives beside the component, not in `lib/`: it needs the DOM, and
 * `client/lib` is shared with the native app.
 */
const MAX_EDGE = 2000;
const SKIP_BELOW_BYTES = 800_000;

export async function downscalePhoto(file: File): Promise<File> {
  if (file.type !== "image/jpeg" || file.size < SKIP_BELOW_BYTES) return file;
  if (typeof createImageBitmap !== "function") return file;
  try {
    // "from-image" bakes the EXIF rotation in, so a portrait shot stays upright.
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const context = canvas.getContext("2d");
    if (!context) {
      bitmap.close();
      return file;
    }
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.9));
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], file.name, { type: "image/jpeg", lastModified: file.lastModified });
  } catch {
    return file;
  }
}
