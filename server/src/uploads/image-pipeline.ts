import { UnsupportedMediaTypeException } from '@nestjs/common';
import sharp from 'sharp';
import { SniffedImage } from './image-type';

/**
 * Re-encodes an accepted upload before it is ever written to disk.
 *
 * Until this existed the bytes a phone produced were the bytes we stored:
 * a modern handset shoots 4000×3000 at 4–8MB, and every one of those was
 * kept at full size on a 48GB VPS, re-optimised by `next/image` on the web
 * process on first request, and — the part that actually matters — still
 * carrying its EXIF block.
 *
 * Three separate problems, one pass:
 *
 * 1. **Metadata is stripped.** A phone photo taken in a home kitchen
 *    carries GPS coordinates. Publishing a home cook's uploaded listing
 *    photo therefore published their home address, to anyone who ran
 *    `exiftool` on a public URL. This is the reason the pipeline is not
 *    optional and not a "nice to have" — it is the one change here that
 *    fixes a live privacy leak rather than a cost.
 *
 * 2. **Size is capped and the format is normalised** — see the constants.
 *
 * 3. **Decompression bombs are refused.** `limitInputPixels` rejects the
 *    classic tiny-file/enormous-canvas PNG before libvips allocates for
 *    it. `UPLOAD_MAX_BYTES` never caught these: the whole trick is that
 *    the *file* is small.
 */

/**
 * Longest edge kept, in pixels.
 *
 * The widest an uploaded image is ever *displayed* is the storefront
 * banner at 1180px (the `.container` maximum), so 2000 leaves headroom for
 * a 2× DPR crop and for `next/image` to have something to downscale from,
 * without keeping the 4000px original nobody requests. Images already
 * smaller than this are never enlarged.
 */
const MAX_EDGE = 2000;

/**
 * WebP quality. 82 is the knee of the curve for photographs — visually
 * indistinguishable from the source at normal viewing size, roughly a
 * tenth of the bytes of a straight-from-phone JPEG.
 */
const WEBP_QUALITY = 82;

/**
 * Hard ceiling on decoded pixels — ~90 megapixels, comfortably above any
 * real camera and far below what it takes to exhaust a 3.8GB box.
 */
const MAX_INPUT_PIXELS = 90_000_000;

export interface ProcessedImage {
  body: Buffer;
  mime: 'image/webp';
  ext: 'webp';
  width: number;
  height: number;
  /** Size of the accepted upload, before re-encoding. Logged, not stored. */
  originalBytes: number;
}

/**
 * Everything becomes WebP.
 *
 * **Not AVIF**, despite AVIF being the better format on paper: encoding it
 * costs seconds of CPU per image, and this runs inline on a request thread
 * on a 1 vCPU box, so a HomeKrafter adding six photos to a listing would
 * sit through it. WebP encodes in ~100ms, is supported by every browser
 * this platform targets, and `next/image` can still serve AVIF from it on
 * the read path if a client advertises it. If the box ever grows CPU,
 * changing the encoder here is a one-line change and no stored URL moves,
 * because the extension is derived rather than echoed from the upload.
 *
 * Animated sources are flattened to their first frame. Nothing on the
 * platform displays an animation — every image is a product, menu,
 * storefront or application photo — and carrying the filmstrip through a
 * resize is a real cost for a case that does not exist.
 */
export async function processImage(
  buffer: Buffer,
  sniffed: SniffedImage,
): Promise<ProcessedImage> {
  try {
    const pipeline = sharp(buffer, {
      limitInputPixels: MAX_INPUT_PIXELS,
      // Streams the source rather than holding a full random-access
      // decode. Meaningfully lower peak RSS on the box for large JPEGs.
      sequentialRead: true,
    })
      // Bakes the EXIF orientation flag into the pixels. This has to
      // happen *because* we strip metadata a step later: drop the flag
      // without applying it and every photo shot in portrait on a phone
      // is stored on its side.
      .rotate()
      .resize({
        width: MAX_EDGE,
        height: MAX_EDGE,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .webp({ quality: WEBP_QUALITY });

    // sharp drops all metadata unless `withMetadata()` is called, which it
    // deliberately is not — see the GPS note above.
    const { data, info } = await pipeline.toBuffer({ resolveWithObject: true });

    return {
      body: data,
      mime: 'image/webp',
      ext: 'webp',
      width: info.width,
      height: info.height,
      originalBytes: buffer.byteLength,
    };
  } catch {
    // The container sniff (`image-type.ts`) only reads a magic number, so
    // a file can pass it and still be truncated, corrupt, or a bomb. All
    // of those land here, and all of them are the caller's problem rather
    // than a server fault — a 500 would page somebody for a bad JPEG.
    throw new UnsupportedMediaTypeException(
      `That ${sniffed.ext.toUpperCase()} image could not be read. It may be corrupt or too large.`,
    );
  }
}
