// A small PNG writer and reader (RGBA, 8 bits per channel, no filtering), so the art tools need no packages.
import { deflateSync, inflateSync } from 'node:zlib';

const CRC_TABLE = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(bytes) {
  let c = 0xffffffff;
  for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'ascii');
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}

/** An image to draw into: `rgba` holds width × height pixels, 4 bytes each. */
export function image(width, height) {
  return { width, height, rgba: new Uint8Array(width * height * 4) };
}

/** Set one pixel to a 0xRRGGBB colour, fully opaque unless `alpha` (0–255) is given. Off-image pixels are ignored. */
export function put(img, x, y, colour, alpha = 255) {
  if (x < 0 || y < 0 || x >= img.width || y >= img.height) return;
  const i = (y * img.width + x) * 4;
  img.rgba[i] = (colour >> 16) & 0xff;
  img.rgba[i + 1] = (colour >> 8) & 0xff;
  img.rgba[i + 2] = colour & 0xff;
  img.rgba[i + 3] = alpha;
}

/** The colour at a pixel, or null where it is transparent or off the image. */
export function get(img, x, y) {
  if (x < 0 || y < 0 || x >= img.width || y >= img.height) return null;
  const i = (y * img.width + x) * 4;
  if (img.rgba[i + 3] === 0) return null;
  return (img.rgba[i] << 16) | (img.rgba[i + 1] << 8) | img.rgba[i + 2];
}

export function encodePng(img) {
  const raw = Buffer.alloc((img.width * 4 + 1) * img.height);
  for (let y = 0; y < img.height; y++) {
    raw[y * (img.width * 4 + 1)] = 0;
    Buffer.from(img.rgba.buffer, img.rgba.byteOffset + y * img.width * 4, img.width * 4).copy(raw, y * (img.width * 4 + 1) + 1);
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(img.width, 0);
  header.writeUInt32BE(img.height, 4);
  header[8] = 8; // bits per channel
  header[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** Width and height from a PNG's header. */
export function pngSize(bytes) {
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

export { inflateSync };
