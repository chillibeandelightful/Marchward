// Writes template PNGs for drawing art to docs/ART.md: guides to paint over, so new art lines up
// first time. Run with `npm run art:templates`; the files go in art-templates/ (not committed).
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { encodePng, image, put } from './png.mjs';

const OUT = join(import.meta.dirname, '..', '..', 'art-templates');
const GUIDE = 0x5fb4ea;
const FAINT = 0x3a5a70;
const ANCHOR = 0xd8452f;

/** The Low view's numbers, which the art is drawn for (see src/render/iso.ts). */
const TILE_W = 64;
const TILE_H = 16;
const LEVEL = 26;

function line(img, x0, y0, x1, y1, c) {
  const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
  for (let i = 0; i <= n; i++) put(img, Math.round(x0 + ((x1 - x0) * i) / n), Math.round(y0 + ((y1 - y0) * i) / n), c);
}

function diamond(img, cx, cy, w, h, c) {
  line(img, cx - w / 2, cy, cx, cy - h / 2, c);
  line(img, cx, cy - h / 2, cx + w / 2 - 1, cy, c);
  line(img, cx + w / 2 - 1, cy, cx, cy + h / 2, c);
  line(img, cx, cy + h / 2, cx - w / 2, cy, c);
}

mkdirSync(OUT, { recursive: true });

// A sprite (tree, rock, figure): the tile it stands on, the anchor pixel, and one level's height.
{
  const img = image(96, 80);
  const ax = 48;
  const ay = 71;
  diamond(img, ax, ay, TILE_W, TILE_H, GUIDE);
  diamond(img, ax, ay, 64, 32, FAINT); // the Standard view's tile, for comparison
  for (let y = ay; y >= 0; y -= LEVEL) line(img, 0, y, 5, y, GUIDE);
  put(img, ax, ay, ANCHOR);
  writeFileSync(join(OUT, 'sprite.png'), encodePng(img));
}

// The stone face texture: two tiles wide and two Low view levels high, repeating on every side.
{
  const img = image(64, 52);
  for (let y = 0; y < 52; y++) {
    put(img, 0, y, GUIDE);
    put(img, 32, y, FAINT);
  }
  for (let x = 0; x < 64; x++) {
    put(img, x, 0, GUIDE);
    put(img, x, 26, FAINT);
  }
  writeFileSync(join(OUT, 'stone-face.png'), encodePng(img));
}

// The stone top texture: one tile square, seen from above.
{
  const img = image(32, 32);
  for (let i = 0; i < 32; i++) {
    put(img, i, 0, GUIDE);
    put(img, 0, i, GUIDE);
  }
  writeFileSync(join(OUT, 'stone-top.png'), encodePng(img));
}
console.log(`Wrote ${OUT}`);
