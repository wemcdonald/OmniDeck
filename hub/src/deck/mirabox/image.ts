import sharp from "sharp";

/**
 * Encode a raw RGB buffer for transmission to a Mirabox key.
 *
 * The device's display hardware is physically rotated and mirrored, so images
 * must be pre-transformed: rotate 90°, then flip both axes (flop + flip).
 * The device expects JPEG data.
 */
export async function encodeKeyImage(
  rgb: Buffer,
  sourceSize: { width: number; height: number },
  targetSize: number,
): Promise<Buffer> {
  return sharp(rgb, {
    raw: { width: sourceSize.width, height: sourceSize.height, channels: 3 },
  })
    .resize(targetSize, targetSize, { fit: "fill" })
    .rotate(90)
    .flop()
    .flip()
    .jpeg({ quality: 90 })
    .toBuffer();
}
