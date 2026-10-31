// The art master: every file in public/art/ laid out on one big image, so the whole set can be
// painted (or handed to someone else to paint) in one place and kept in one style, then split back
// into the game's files. See "The art master" in docs/ART.md.
//
// The master shows each art file as a box, scaled up by a whole number so single pixels are easy to
// see and hit. Transparent pixels are filled with magenta. The space between boxes holds titles,
// sprite names and notes for whoever paints it; splitting reads only what is inside the boxes.
// The layout is written into the PNG (a tEXt chunk) and alongside it as JSON, and can always be
// worked out again from the manifest, so a master that comes back without either still splits.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { decodePng, image, put } from './png.mjs';
import { drawText, textWidth, GLYPH_H } from './font.mjs';

export const LAYOUT_KEY = 'marchward-art-layout';
export const KEY = 0xff00ff;
const GUTTER = 0x2e2c29;
const INK = 0xe8e0d0;
const DIM = 0x9a9488;
const EDGE = 0x111111;
const ANCHOR = 0xff3b1f;
/** Frame outlines on the legend, one colour per sprite in turn. */
const OUTLINES = [0x36d6e7, 0xf2d43d, 0x7be35a, 0xff9de2, 0xffffff, 0xff9a3c];

const MARGIN = 32;
const GAP = 28;
const TEXT = 2; // image pixels per font pixel
const LINE = (GLYPH_H + 3) * TEXT;
const TITLE_H = LINE + 6;

export const NOTES = [
  'MAGENTA = TRANSPARENT. PAINT ONLY INSIDE THE BOXES. DO NOT MOVE, RESIZE OR ADD BOXES.',
  'KEEP THE WHOLE IMAGE THE SAME SIZE (OR SCALE IT EVENLY). SAVE AS PNG.',
  'PIXEL ART: HARD EDGES, NO ANTI-ALIASING. ONE ART PIXEL IS ONE SQUARE BLOCK HERE.',
  'LIGHT FROM THE UPPER LEFT: LIT LEFT AND TOP, SHADED RIGHT AND BOTTOM. NO CAST SHADOWS.',
  'SPRITES: DARK OUTLINE. EACH ROW IS ONE SPRITE, ITS FRAMES OR VARIANTS LEFT TO RIGHT. PEOPLE FACE RIGHT.',
  'KEEP EACH SPRITE STANDING ON THE SAME GROUND PIXEL (BOTTOM MIDDLE OF ITS FRAME).',
  'TEXTURES MUST TILE SEAMLESSLY. GROUND: A QUARTER BRIGHTER THAN WANTED. STONE: EVENLY LIT.',
  'MUTED PALETTE: OLIVE AND BROWN GROUND, GREY STONE, DARK GREEN PINES, SLATE WATER.',
];

/** `raiderArcher.shoot` as `RAIDER ARCHER SHOOT`. */
const spoken = (name) => name.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/\./g, ' ').toUpperCase();

/** Which column each file goes in; anything not listed goes in the shortest column. */
const COLUMNS = [['people.png'], ['plants.png', 'camp.png', 'stone-face.png', 'stone-top.png'], ['ground-']];

/**
 * Lay out the master for a manifest and the size of each file. Returns the layout: the master's
 * size and, for each file, where its box sits (in master pixels) and its size (in art pixels).
 */
export function planLayout(manifest, sizes, scale = 4) {
  const files = [...Object.keys(manifest.sheets), ...new Set(Object.values(manifest.textures))];
  const items = files.map((file) => {
    const { width: w, height: h } = sizes[file];
    const sprites = manifest.sheets[file];
    const textureNames = Object.entries(manifest.textures)
      .filter(([, f]) => f === file)
      .map(([n]) => n);
    const labels = sprites ? Object.entries(sprites).map(([name, frames]) => `${spoken(name)} (${frames.length})`) : [];
    const labelW = labels.length ? Math.max(...labels.map((l) => textWidth(l, TEXT))) + 16 : 0;
    const title = `${file.toUpperCase()} ${w}x${h}${sprites ? '' : ' TILES'}`;
    const sub = textureNames.length ? textureNames.map(spoken).join(', ') : '';
    const boxW = w * scale + labelW;
    const titleW = Math.max(textWidth(title, TEXT), textWidth(sub, TEXT));
    return { file, w, h, sprites, title, sub, labelW, width: Math.max(boxW, titleW), height: TITLE_H + (sub ? LINE : 0) + h * scale };
  });
  const columns = COLUMNS.map(() => []);
  const rest = [];
  for (const it of items) {
    const c = COLUMNS.findIndex((list) => list.some((p) => (p.endsWith('-') ? it.file.startsWith(p) : it.file === p)));
    (c >= 0 ? columns[c] : rest).push(it);
  }
  const colHeight = (col) => col.reduce((s, it) => s + it.height + GAP, 0);
  for (const it of rest) columns.reduce((a, b) => (colHeight(b) < colHeight(a) ? b : a)).push(it);

  const headerH = 3 * 8 + 12 + NOTES.length * LINE + 16;
  const placed = [];
  let x = MARGIN;
  let bottom = 0;
  for (const col of columns) {
    if (col.length === 0) continue;
    let y = MARGIN + headerH;
    for (const it of col) {
      placed.push({ ...it, tx: x, ty: y, bx: x, by: y + TITLE_H + (it.sub ? LINE : 0) });
      y += it.height + GAP;
    }
    bottom = Math.max(bottom, y);
    x += Math.max(...col.map((it) => it.width)) + GAP * 2;
  }
  const width = Math.max(x - GAP * 2 + MARGIN, MARGIN * 2 + Math.max(...NOTES.map((n) => textWidth(n, TEXT))));
  return {
    version: 1,
    scale,
    width,
    height: bottom - GAP + MARGIN,
    blocks: placed.map((p) => ({ file: p.file, x: p.bx, y: p.by, w: p.w, h: p.h, tiles: !p.sprites })),
    // Drawing details, not needed to split a master.
    _draw: placed,
  };
}

/** Read the manifest and every file it lists from an art folder. */
export function readArt(dir) {
  const manifest = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8'));
  const files = [...Object.keys(manifest.sheets), ...new Set(Object.values(manifest.textures))];
  const images = Object.fromEntries(files.map((f) => [f, decodePng(readFileSync(join(dir, f)))]));
  const sizes = Object.fromEntries(files.map((f) => [f, { width: images[f].width, height: images[f].height }]));
  return { manifest, images, sizes };
}

function fill(img, x, y, w, h, c) {
  for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) put(img, i, j, c);
}

function frameRect(img, x0, y0, x1, y1, c) {
  for (let x = x0; x <= x1; x++) {
    put(img, x, y0, c);
    put(img, x, y1, c);
  }
  for (let y = y0; y <= y1; y++) {
    put(img, x0, y, c);
    put(img, x1, y, c);
  }
}

/**
 * Draw the master (and, with `legend`, the reference copy with every frame outlined and each anchor
 * marked in red on the frame's bottom edge). Returns { img, layout } with the layout as saved.
 */
export function drawMaster(art, { scale = 4, legend = false } = {}) {
  const plan = planLayout(art.manifest, art.sizes, scale);
  const img = image(plan.width, plan.height);
  fill(img, 0, 0, plan.width, plan.height, GUTTER);

  let y = MARGIN;
  drawText(img, MARGIN, y, legend ? 'MARCHWARD ART - LEGEND (REFERENCE ONLY, PAINT ON THE PLAIN MASTER)' : 'MARCHWARD ART MASTER', INK, 3);
  y += 3 * 8 + 12;
  for (const note of NOTES) {
    drawText(img, MARGIN, y, note, DIM, TEXT);
    y += LINE;
  }
  drawText(img, MARGIN, plan.height - MARGIN + 8, `SCALE ${scale}: EACH ART PIXEL IS ${scale}x${scale}`, DIM, TEXT);

  for (const p of plan._draw) {
    drawText(img, p.tx, p.ty, p.title, INK, TEXT);
    if (p.sub) drawText(img, p.tx, p.ty + LINE, p.sub, DIM, TEXT);
    const src = art.images[p.file];
    frameRect(img, p.bx - 2, p.by - 2, p.bx + p.w * scale + 1, p.by + p.h * scale + 1, EDGE);
    for (let j = 0; j < p.h; j++) {
      for (let i = 0; i < p.w; i++) {
        const o = (j * p.w + i) * 4;
        const c = src.rgba[o + 3] < 128 ? KEY : (src.rgba[o] << 16) | (src.rgba[o + 1] << 8) | src.rgba[o + 2];
        fill(img, p.bx + i * scale, p.by + j * scale, scale, scale, c);
      }
    }
    if (!p.sprites) continue;
    let n = 0;
    for (const [name, frames] of Object.entries(p.sprites)) {
      const colour = OUTLINES[n++ % OUTLINES.length];
      const first = frames[0];
      const label = `${spoken(name)} (${frames.length})`;
      const ly = p.by + first.y * scale + Math.max(0, Math.round((first.h * scale - GLYPH_H * TEXT) / 2));
      drawText(img, p.bx + p.w * scale + 12, ly, label, legend ? colour : INK, TEXT);
      if (!legend) continue;
      for (const f of frames) {
        const x0 = p.bx + f.x * scale - 1;
        const y0 = p.by + f.y * scale - 1;
        const x1 = p.bx + (f.x + f.w) * scale;
        const y1 = p.by + (f.y + f.h) * scale;
        frameRect(img, x0, y0, x1, y1, colour);
        // The anchor: a red mark on the bottom edge under the ground pixel, and on the side at its row.
        for (let k = 0; k < scale; k++) {
          put(img, p.bx + (f.x + f.ax) * scale + k, y1, ANCHOR);
          put(img, p.bx + (f.x + f.ax) * scale + k, y1 + 1, ANCHOR);
          put(img, x0, p.by + (f.y + f.ay) * scale + k, ANCHOR);
        }
      }
    }
  }
  const { _draw, ...layout } = plan;
  return { img, layout };
}

const isKey = (r, g, b) => r >= 170 && b >= 170 && g <= 100 && Math.abs(r - b) <= 80;

/**
 * Split a master back into art images. `master` is a decoded PNG; it may be scaled evenly from the
 * size it was made at (an editor or an image model often returns a different size). Each art pixel
 * takes the most common colour in the middle of its square, or the average when nothing dominates,
 * so a little blur or compression noise does no harm. Magenta, or alpha below half, is transparent.
 *
 * Returns { images: { file: image }, problems: [text] }. Textures can't be transparent: any pixel
 * that comes back transparent keeps the colour from `fallback` (the current art) and is reported.
 */
export function splitMaster(master, layout, fallback = {}) {
  const problems = [];
  const rx = master.width / layout.width;
  const ry = master.height / layout.height;
  if (Math.abs(rx - ry) / Math.max(rx, ry) > 0.02)
    throw new Error(
      `the master is ${master.width}x${master.height} but should be ${layout.width}x${layout.height} (or scaled evenly from it): was it cropped or stretched?`,
    );
  const S = layout.scale;
  const images = {};
  for (const b of layout.blocks) {
    const out = image(b.w, b.h);
    const texture = b.tiles === true;
    let holes = 0;
    for (let j = 0; j < b.h; j++) {
      for (let i = 0; i < b.w; i++) {
        // The middle half of this art pixel's square on the master.
        const x0 = (b.x + i * S) * rx;
        const y0 = (b.y + j * S) * ry;
        const sw = S * rx;
        const sh = S * ry;
        const xa = Math.floor(x0 + sw * 0.25);
        const xb = Math.max(xa + 1, Math.ceil(x0 + sw * 0.75));
        const ya = Math.floor(y0 + sh * 0.25);
        const yb = Math.max(ya + 1, Math.ceil(y0 + sh * 0.75));
        let clear = 0;
        let total = 0;
        const counts = new Map();
        let sr = 0;
        let sg = 0;
        let sb = 0;
        for (let y = ya; y < yb; y++) {
          for (let x = xa; x < xb; x++) {
            if (x >= master.width || y >= master.height) continue;
            const o = (y * master.width + x) * 4;
            const r = master.rgba[o];
            const g = master.rgba[o + 1];
            const bl = master.rgba[o + 2];
            total++;
            if (master.rgba[o + 3] < 128 || isKey(r, g, bl)) {
              clear++;
              continue;
            }
            const c = (r << 16) | (g << 8) | bl;
            counts.set(c, (counts.get(c) ?? 0) + 1);
            sr += r;
            sg += g;
            sb += bl;
          }
        }
        const o = (j * b.w + i) * 4;
        const opaque = total - clear;
        if (opaque === 0 || clear * 2 > total) {
          if (texture) {
            holes++;
            const f = fallback[b.file];
            if (f && f.width === b.w && f.height === b.h) out.rgba.set(f.rgba.subarray(o, o + 4), o);
          }
          continue; // transparent
        }
        let best = 0;
        let bestN = 0;
        for (const [c, k] of counts)
          if (k > bestN) {
            best = c;
            bestN = k;
          }
        if (bestN * 2 >= opaque) {
          out.rgba[o] = best >> 16;
          out.rgba[o + 1] = (best >> 8) & 0xff;
          out.rgba[o + 2] = best & 0xff;
        } else {
          out.rgba[o] = Math.round(sr / opaque);
          out.rgba[o + 1] = Math.round(sg / opaque);
          out.rgba[o + 2] = Math.round(sb / opaque);
        }
        out.rgba[o + 3] = 255;
      }
    }
    if (holes) problems.push(`${b.file}: ${holes} pixels came back transparent, but a texture can't have holes; they keep their old colour`);
    images[b.file] = out;
  }
  return { images, problems };
}

/** The layout to split a master with: the one written into it, or else worked out from the manifest. */
export function layoutFor(master, art, scale) {
  const saved = master.text?.[LAYOUT_KEY];
  if (saved) return { layout: JSON.parse(saved), from: 'the layout saved in the image' };
  // Without it, work out the layout again at each likely scale and take the one whose shape fits.
  const tries = (scale ? [scale] : [4, 1, 2, 3, 5, 6, 8]).map((s) => planLayout(art.manifest, art.sizes, s));
  const fit = tries.find((l) => Math.abs(master.width / l.width - master.height / l.height) < 0.02 * (master.width / l.width));
  return { layout: fit ?? tries[0], from: 'the current manifest (the image had no saved layout)' };
}
