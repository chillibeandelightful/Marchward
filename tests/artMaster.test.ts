import { join } from 'node:path';
import { deflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { drawMaster, KEY, layoutFor, LAYOUT_KEY, readArt, splitMaster, type Img } from '../tools/art/master.mjs';
import { decodePng, encodePng, image } from '../tools/art/png.mjs';

const art = readArt(join(process.cwd(), 'public', 'art'));

/** Pixels that differ, counting any two fully transparent pixels as equal. */
function differences(a: Img, b: Img): number {
  expect([a.width, a.height]).toEqual([b.width, b.height]);
  let n = 0;
  for (let i = 0; i < a.rgba.length; i += 4) {
    const ca = a.rgba[i + 3]! < 128;
    const cb = b.rgba[i + 3]! < 128;
    if (ca !== cb || (!ca && (a.rgba[i] !== b.rgba[i] || a.rgba[i + 1] !== b.rgba[i + 1] || a.rgba[i + 2] !== b.rgba[i + 2]))) n++;
  }
  return n;
}

function resize(src: Img, f: number): Img {
  const out = image(Math.round(src.width * f), Math.round(src.height * f));
  for (let y = 0; y < out.height; y++)
    for (let x = 0; x < out.width; x++) {
      const s = (Math.min(src.height - 1, Math.floor(y / f)) * src.width + Math.min(src.width - 1, Math.floor(x / f))) * 4;
      out.rgba.set(src.rgba.subarray(s, s + 4), (y * out.width + x) * 4);
    }
  return out;
}

describe('art master', () => {
  const { img, layout } = drawMaster(art, { scale: 4 });

  it('holds every art file in its own box, none overlapping', () => {
    const files = new Set([...Object.keys(art.manifest.sheets), ...Object.values(art.manifest.textures)]);
    expect(new Set(layout.blocks.map((b) => b.file))).toEqual(files);
    for (const a of layout.blocks) {
      expect(a.x + a.w * 4).toBeLessThanOrEqual(layout.width);
      expect(a.y + a.h * 4).toBeLessThanOrEqual(layout.height);
      for (const b of layout.blocks) {
        if (a === b) continue;
        const apart = a.x + a.w * 4 <= b.x || b.x + b.w * 4 <= a.x || a.y + a.h * 4 <= b.y || b.y + b.h * 4 <= a.y;
        expect(apart, `${a.file} and ${b.file}`).toBe(true);
      }
    }
  });

  it('splits back into exactly the same art, through a PNG file', () => {
    const master = decodePng(encodePng(img, { [LAYOUT_KEY]: JSON.stringify(layout) }));
    const { layout: saved } = layoutFor(master, art);
    expect(saved).toEqual(layout);
    const { images, problems } = splitMaster(master, saved, art.images);
    expect(problems).toEqual([]);
    for (const [file, out] of Object.entries(images)) expect(differences(out, art.images[file]!), file).toBe(0);
  });

  it('still splits when resized evenly, flattened and stripped of its saved layout', () => {
    for (const f of [0.75, 2.5]) {
      const master = resize(img, f);
      for (let i = 3; i < master.rgba.length; i += 4) master.rgba[i] = 255; // no alpha: magenta only
      const { layout: worked } = layoutFor(master, art); // no text: worked out from the manifest
      const { images } = splitMaster(master, worked, art.images);
      for (const [file, out] of Object.entries(images)) expect(differences(out, art.images[file]!), `${file} at ${f}`).toBe(0);
    }
  });

  it('picks up a painted change and keeps textures free of holes', () => {
    const edited = { ...img, rgba: img.rgba.slice() };
    const people = layout.blocks.find((b) => b.file === 'people.png')!;
    const grass = layout.blocks.find((b) => b.file === 'ground-grass.png')!;
    const paint = (bx: number, by: number, c: number) => {
      for (let y = by; y < by + 4; y++)
        for (let x = bx; x < bx + 4; x++) edited.rgba.set([c >> 16, (c >> 8) & 255, c & 255, 255], (y * edited.width + x) * 4);
    };
    paint(people.x, people.y, 0x123456); // top left of the people sheet, transparent before
    paint(grass.x, grass.y, KEY); // a hole in a texture
    const { images, problems } = splitMaster(edited, layout, art.images);
    expect(differences(images['people.png']!, art.images['people.png']!)).toBe(1);
    expect([...images['people.png']!.rgba.subarray(0, 4)]).toEqual([0x12, 0x34, 0x56, 255]);
    expect(differences(images['ground-grass.png']!, art.images['ground-grass.png']!)).toBe(0);
    expect(problems.length).toBe(1);
  });

  it('refuses a master that was cropped or stretched', () => {
    expect(() => splitMaster({ ...image(img.width, Math.round(img.height * 0.8)) }, layout)).toThrow(/cropped or stretched/);
  });
});

describe('PNG reader', () => {
  it('reads palette PNGs with filtered rows and transparency, as editors save them', () => {
    // A 3 × 2 palette image: red, green, clear / blue, green, clear, rows filtered Sub and Up.
    const chunk = (type: string, data: Buffer) => {
      const out = Buffer.alloc(12 + data.length);
      out.writeUInt32BE(data.length, 0);
      out.write(type, 4, 'ascii');
      data.copy(out, 8);
      return out; // the reader doesn't check CRCs
    };
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(3, 0);
    ihdr.writeUInt32BE(2, 4);
    ihdr[8] = 8;
    ihdr[9] = 3;
    const rows = Buffer.from([1, 0, 1, 1, 2, 3, 0, 0]); // Sub: 0,1,2 ; Up: 3,1,2
    const png = Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      chunk('IHDR', ihdr),
      chunk('PLTE', Buffer.from([255, 0, 0, 0, 255, 0, 9, 9, 9, 0, 0, 255])),
      chunk('tRNS', Buffer.from([255, 255, 0])),
      chunk('IDAT', deflateSync(rows)),
      chunk('IEND', Buffer.alloc(0)),
    ]);
    const img = decodePng(png);
    expect([...img.rgba]).toEqual([255, 0, 0, 255, 0, 255, 0, 255, 9, 9, 9, 0, 0, 0, 255, 255, 0, 255, 0, 255, 9, 9, 9, 0]);
  });
});
