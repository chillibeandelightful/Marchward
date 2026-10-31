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

/** Encode an image as a PNG. `text` adds tEXt chunks (keyword to value), which some editors keep. */
export function encodePng(img, text = {}) {
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
    ...Object.entries(text).map(([k, v]) => chunk('tEXt', Buffer.from(`${k}\0${v}`, 'latin1'))),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** Width and height from a PNG's header. */
export function pngSize(bytes) {
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

/**
 * Decode a PNG into the same RGBA image shape `image()` makes, whatever the editor saved: grey,
 * RGB, palette or RGBA, 1 to 16 bits, any row filter, with tRNS transparency. Interlaced files are
 * refused (re-save without interlacing). Also returns the file's tEXt chunks.
 */
export function decodePng(bytes) {
  const buf = Buffer.from(bytes);
  if (buf.length < 8 || buf.readUInt32BE(0) !== 0x89504e47) throw new Error('not a PNG file');
  let width = 0;
  let height = 0;
  let depth = 8;
  let type = 6;
  let interlace = 0;
  let palette = null;
  let trns = null;
  const idat = [];
  const text = {};
  for (let i = 8; i + 8 <= buf.length; ) {
    const len = buf.readUInt32BE(i);
    const kind = buf.toString('ascii', i + 4, i + 8);
    const data = buf.subarray(i + 8, i + 8 + len);
    if (kind === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      depth = data[8];
      type = data[9];
      interlace = data[12];
    } else if (kind === 'PLTE') palette = data;
    else if (kind === 'tRNS') trns = data;
    else if (kind === 'IDAT') idat.push(data);
    else if (kind === 'tEXt') {
      const z = data.indexOf(0);
      if (z > 0) text[data.toString('latin1', 0, z)] = data.toString('latin1', z + 1);
    } else if (kind === 'IEND') break;
    i += 12 + len;
  }
  if (interlace) throw new Error('interlaced PNGs are not supported; save it again without interlacing');
  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[type];
  if (!channels) throw new Error(`unknown PNG colour type ${type}`);
  const bpp = Math.max(1, (channels * depth) >> 3); // bytes per pixel, for the filters
  const stride = Math.ceil((width * channels * depth) / 8);
  const raw = inflateSync(Buffer.concat(idat));
  const rows = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    const f = raw[y * (stride + 1)];
    const src = y * (stride + 1) + 1;
    const out = y * stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? rows[out + x - bpp] : 0;
      const b = y > 0 ? rows[out - stride + x] : 0;
      const c = x >= bpp && y > 0 ? rows[out - stride + x - bpp] : 0;
      let v = raw[src + x];
      if (f === 1) v += a;
      else if (f === 2) v += b;
      else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      rows[out + x] = v & 0xff;
    }
  }
  // Sample n of the row's values, scaled to 0-255 (palette indices are left as they are).
  const sample = (y, n) => {
    if (depth === 8) return rows[y * stride + n];
    if (depth === 16) return rows[y * stride + n * 2];
    const bit = n * depth;
    const v = (rows[y * stride + (bit >> 3)] >> (8 - depth - (bit & 7))) & ((1 << depth) - 1);
    return type === 3 ? v : Math.round((v * 255) / ((1 << depth) - 1));
  };
  const rawSample = (y, n) => (depth === 16 ? rows.readUInt16BE(y * stride + n * 2) : sample(y, n));
  const img = image(width, height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const o = (y * width + x) * 4;
      let r, g, b, a = 255;
      if (type === 3) {
        const idx = sample(y, x);
        r = palette?.[idx * 3] ?? 0;
        g = palette?.[idx * 3 + 1] ?? 0;
        b = palette?.[idx * 3 + 2] ?? 0;
        if (trns && idx < trns.length) a = trns[idx];
      } else if (type === 0 || type === 4) {
        r = g = b = sample(y, x * channels);
        if (type === 4) a = sample(y, x * channels + 1);
        else if (trns && rawSample(y, x) === trns.readUInt16BE(0)) a = 0;
      } else {
        r = sample(y, x * channels);
        g = sample(y, x * channels + 1);
        b = sample(y, x * channels + 2);
        if (type === 6) a = sample(y, x * channels + 3);
        else if (
          trns &&
          rawSample(y, x * 3) === trns.readUInt16BE(0) &&
          rawSample(y, x * 3 + 1) === trns.readUInt16BE(2) &&
          rawSample(y, x * 3 + 2) === trns.readUInt16BE(4)
        )
          a = 0;
      }
      img.rgba[o] = r;
      img.rgba[o + 1] = g;
      img.rgba[o + 2] = b;
      img.rgba[o + 3] = a;
    }
  }
  return { ...img, text };
}

export { inflateSync };
