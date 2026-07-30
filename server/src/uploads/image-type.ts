/**
 * Identifies an image from its leading bytes.
 *
 * The multipart `Content-Type` and filename are both supplied by whoever
 * is calling, so neither says anything about what the bytes are. Trusting
 * them is how an HTML page or a script gets stored as `.jpg` and later
 * served back from our own origin — which, for anything sharing a domain
 * with a logged-in session, is a stored-XSS primitive rather than a
 * cosmetic problem. Sniffing the container is the check that actually
 * holds: we store the extension *we* derived, and reject anything we don't
 * positively recognise.
 *
 * Deliberately not a full format parser. It answers one question — "is
 * this one of the four raster formats we accept?" — and everything else is
 * a rejection. SVG is excluded on purpose: it is XML, it can carry script,
 * and browsers execute it when it's served as an image at a URL.
 */

export type ImageMime = 'image/jpeg' | 'image/png' | 'image/webp' | 'image/avif';

export interface SniffedImage {
  mime: ImageMime;
  ext: 'jpg' | 'png' | 'webp' | 'avif';
}

function hasBytes(buffer: Buffer, offset: number, bytes: number[]): boolean {
  if (buffer.length < offset + bytes.length) return false;
  return bytes.every((byte, i) => buffer[offset + i] === byte);
}

/** `null` for anything not positively identified — callers reject on it. */
export function sniffImage(buffer: Buffer): SniffedImage | null {
  // JPEG: SOI marker FF D8 FF.
  if (hasBytes(buffer, 0, [0xff, 0xd8, 0xff])) {
    return { mime: 'image/jpeg', ext: 'jpg' };
  }

  // PNG: the 8-byte signature.
  if (hasBytes(buffer, 0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return { mime: 'image/png', ext: 'png' };
  }

  // RIFF container: "RIFF" .... "WEBP". The 4 length bytes between the two
  // tags are why this is checked at two offsets rather than one run.
  if (
    hasBytes(buffer, 0, [0x52, 0x49, 0x46, 0x46]) &&
    hasBytes(buffer, 8, [0x57, 0x45, 0x42, 0x50])
  ) {
    return { mime: 'image/webp', ext: 'webp' };
  }

  // ISO-BMFF: "ftyp" at offset 4, then a brand. AVIF images are `avif`;
  // `avis` is an image *sequence*, accepted here because browsers render
  // it in an <img> exactly the same way.
  if (hasBytes(buffer, 4, [0x66, 0x74, 0x79, 0x70])) {
    const brand = buffer.subarray(8, 12).toString('latin1');
    if (brand === 'avif' || brand === 'avis') {
      return { mime: 'image/avif', ext: 'avif' };
    }
  }

  return null;
}
