import sharp from 'sharp';
import { UnsupportedMediaTypeException } from '@nestjs/common';
import { processImage } from '../../src/uploads/image-pipeline';
import { sniffImage } from '../../src/uploads/image-type';

/**
 * The upload pipeline, tested on real bytes.
 *
 * Nothing here is mocked, because there is nothing worth mocking: the
 * whole point of the pipeline is what libvips does to a real image, and a
 * stubbed sharp would assert that our own call chain is spelled the way we
 * spelled it.
 *
 * The EXIF cases are the ones that matter most. A listing photo comes off
 * a phone, and a phone writes GPS into it — so "the pipeline strips
 * metadata" is a privacy guarantee about a home cook's address, not a
 * file-size optimisation, and it deserves a test that would fail loudly if
 * somebody added `.withMetadata()` to make orientation "work better".
 */

/** A JPEG carrying an EXIF block with GPS and an orientation flag. */
async function phonePhoto(options?: { orientation?: number }): Promise<Buffer> {
  return sharp({
    create: {
      width: 3000,
      height: 2000,
      channels: 3,
      background: { r: 200, g: 120, b: 60 },
    },
  })
    .withMetadata({
      orientation: options?.orientation ?? 1,
      exif: {
        IFD0: { Copyright: 'A Home Cook' },
        // IFD3 is the GPS IFD in the numbering sharp accepts.
        IFD3: { GPSLatitudeRef: 'N', GPSLongitudeRef: 'E' },
      },
    })
    .jpeg()
    .toBuffer();
}

function sniffOrThrow(buffer: Buffer) {
  const sniffed = sniffImage(buffer);
  if (!sniffed) throw new Error('fixture did not pass the sniffer');
  return sniffed;
}

describe('processImage', () => {
  it('re-encodes every accepted format to WebP', async () => {
    const sources = await Promise.all([
      sharp({ create: { width: 40, height: 40, channels: 3, background: '#b98724' } })
        .jpeg()
        .toBuffer(),
      sharp({ create: { width: 40, height: 40, channels: 3, background: '#b98724' } })
        .png()
        .toBuffer(),
      sharp({ create: { width: 40, height: 40, channels: 3, background: '#b98724' } })
        .webp()
        .toBuffer(),
    ]);

    for (const source of sources) {
      const result = await processImage(source, sniffOrThrow(source));
      expect(result.mime).toBe('image/webp');
      expect(result.ext).toBe('webp');
      expect(sniffImage(result.body)?.mime).toBe('image/webp');
    }
  });

  it('strips EXIF, including the GPS block a phone writes', async () => {
    const source = await phonePhoto();
    // Guard the fixture itself: if sharp ever stopped writing this, the
    // assertion below would pass for the wrong reason.
    expect((await sharp(source).metadata()).exif).toBeDefined();

    const result = await processImage(source, sniffOrThrow(source));

    expect((await sharp(result.body).metadata()).exif).toBeUndefined();
  });

  it('applies the EXIF orientation before discarding it', async () => {
    // Orientation 6 means "rotate 90° clockwise on display". Dropping the
    // tag without baking it in stores every portrait phone photo sideways.
    const source = await phonePhoto({ orientation: 6 });
    const result = await processImage(source, sniffOrThrow(source));

    // 3000x2000 landscape, flagged to display rotated -> taller than wide.
    expect(result.height).toBeGreaterThan(result.width);
  });

  it('caps the longest edge at 2000px and keeps the aspect ratio', async () => {
    const source = await sharp({
      create: { width: 4000, height: 3000, channels: 3, background: '#333' },
    })
      .jpeg()
      .toBuffer();

    const result = await processImage(source, sniffOrThrow(source));

    expect(result.width).toBe(2000);
    expect(result.height).toBe(1500);
  });

  it('never enlarges an image that is already small', async () => {
    const source = await sharp({
      create: { width: 120, height: 90, channels: 3, background: '#333' },
    })
      .png()
      .toBuffer();

    const result = await processImage(source, sniffOrThrow(source));

    expect(result.width).toBe(120);
    expect(result.height).toBe(90);
  });

  it('reports the original size so the saving can be logged', async () => {
    const source = await phonePhoto();
    const result = await processImage(source, sniffOrThrow(source));

    expect(result.originalBytes).toBe(source.byteLength);
    expect(result.body.byteLength).toBeLessThan(source.byteLength);
  });

  it('rejects a decompression bomb rather than decoding it', async () => {
    // ~200 megapixels of one flat colour: a few hundred KB on disk, well
    // inside UPLOAD_MAX_BYTES, and past `limitInputPixels`. This is the
    // case a byte-size limit cannot catch.
    const bomb = await sharp({
      create: { width: 20000, height: 10000, channels: 3, background: '#fff' },
    })
      .png({ compressionLevel: 9 })
      .toBuffer();

    await expect(processImage(bomb, sniffOrThrow(bomb))).rejects.toThrow(
      UnsupportedMediaTypeException,
    );
  });

  it('rejects bytes that pass the sniffer but do not decode', async () => {
    // A valid JPEG magic number followed by nothing that is a JPEG.
    const truncated = Buffer.concat([
      Buffer.from([0xff, 0xd8, 0xff]),
      Buffer.alloc(64, 0x41),
    ]);

    await expect(
      processImage(truncated, sniffOrThrow(truncated)),
    ).rejects.toThrow(UnsupportedMediaTypeException);
  });
});
