// Draws Marchward's first set of painted art, pixel by pixel, into public/art/ with its manifest.
// Run with `npm run art:draw`. The PNG files it writes are the art: anyone can paint over them
// (or replace them with their own, to docs/ART.md) and the game uses whatever is there. Running
// this again overwrites them, so keep hand edits out of here or stop running it.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { encodePng, get, image, put } from './png.mjs';
import { int, outline, rng, shift } from './kit.mjs';
import { cart, PEOPLE, person, posesFor } from './figures.mjs';
import { block, fire, logEnd, puff, tent } from './camp.mjs';
import * as ground from './ground.mjs';

const OUT = join(import.meta.dirname, '..', '..', 'public', 'art');

// ---------------------------------------------------------------------------------------------
// Stone. Faces repeat across every wall, tower and keep, so they must tile seamlessly: 64 pixels
// is two tiles along a wall, and 52 pixels is two levels in the Low view.

const MORTAR = 0x2b2926;
const STONES = [0x8f8b82, 0x99958b, 0xa4a094, 0x837f76, 0xaca89c, 0x948c80, 0x8d8e8c, 0x9d968a, 0x7a776f, 0xb3afa3];

function stoneFace() {
  const img = image(64, 52);
  const r = rng(11);
  const courses = [7, 6, 7, 6, 7, 6, 7, 6];
  let y0 = 0;
  for (const h of courses) {
    // Joints along this course, from a random start, wrapping round so the texture repeats.
    const start = int(r, 0, 63);
    const joints = [start];
    let at = start;
    while (true) {
      const w = int(r, 7, 12);
      if (start + 64 - (at + w) < 6) break;
      at += w;
      joints.push(at);
    }
    for (let j = 0; j < joints.length; j++) {
      const from = joints[j];
      const to = j + 1 < joints.length ? joints[j + 1] : start + 64;
      const base = STONES[int(r, 0, STONES.length - 1)];
      const chip = r() < 0.35 ? int(r, 0, 3) : -1;
      for (let x = from; x < to; x++) {
        for (let y = y0; y < y0 + h; y++) {
          const px = x % 64;
          // Mortar along the top of the course and down the joint.
          if (y === y0 || x === from) {
            put(img, px, y, MORTAR);
            continue;
          }
          const bx = x - from - 1;
          const by = y - y0 - 1;
          const bw = to - from - 1;
          const bh = h - 1;
          let c = base;
          if (by === 0) c = shift(c, 20);
          else if (bx === 0) c = shift(c, 10);
          if (by === bh - 1) c = shift(c, -30);
          else if (bx === bw - 1) c = shift(c, -20);
          // Rough, pitted faces: speckles darker and lighter, more of them towards the bottom.
          const n = r();
          if (n < 0.14 + by * 0.03) c = shift(c, -16);
          else if (n > 0.9) c = shift(c, 12);
          // A chipped corner shows the mortar behind.
          const corner = (bx === 0 ? 0 : bx === bw - 1 ? 1 : -9) + (by === 0 ? 0 : by === bh - 1 ? 2 : -9);
          if (corner === chip) c = shift(MORTAR, 14);
          put(img, px, y, c);
        }
      }
    }
    y0 += h;
  }
  return img;
}

/** Flagstones for the tops of walls and towers. */
function stoneTop() {
  const img = image(32, 32);
  const r = rng(23);
  for (let row = 0; row < 4; row++) {
    const off = row % 2 === 0 ? 0 : 5;
    for (let col = 0; col < 3; col++) {
      const base = shift(STONES[int(r, 0, STONES.length - 1)], 8);
      const x0 = off + col * 11;
      for (let x = x0; x < x0 + 11; x++) {
        for (let y = row * 8; y < row * 8 + 8; y++) {
          const px = x % 32;
          if (x === x0 || y === row * 8) {
            put(img, px, y, shift(MORTAR, 18));
            continue;
          }
          let c = base;
          const n = r();
          if (n < 0.12) c = shift(c, -10);
          else if (n > 0.93) c = shift(c, 9);
          put(img, px, y, c);
        }
      }
    }
  }
  return img;
}

// ---------------------------------------------------------------------------------------------
// Plants and rocks. Each is drawn on its own small canvas with the ground contact point at the
// bottom middle, and light from the upper left.

const PINE = { ink: 0x0c140f, shadow: 0x15241a, deep: 0x1c3021, mid: 0x253f2b, lit: 0x325236, glint: 0x466944 };

function pine(variant) {
  const r = rng(100 + variant);
  const img = image(24, 50);
  const cx = 12;
  const height = int(r, 40, 47);
  const tiers = int(r, 5, 6);
  const widest = int(r, 7, 9);
  const trunkH = 4;
  const bottom = 49 - trunkH;
  const top = bottom - height + trunkH;
  const tierH = (bottom - top) / tiers;
  for (let y = top; y <= bottom; y++) {
    const t = Math.min(tiers - 1, Math.floor((y - top) / tierH));
    const within = (y - top - t * tierH) / tierH;
    const tierWidth = 2 + ((widest - 2) * (t + 1)) / tiers;
    const base = tierWidth * (0.3 + 0.7 * within);
    // Each side is ragged on its own, so the tree isn't a neat cone.
    let left = Math.round(base + (r() < 0.35 ? 1 : 0) - (r() < 0.25 ? 1 : 0) + (within > 0.7 && r() < 0.3 ? 1 : 0));
    let right = Math.round(base + (r() < 0.35 ? 1 : 0) - (r() < 0.25 ? 1 : 0) + (within > 0.7 && r() < 0.3 ? 1 : 0));
    if (y === top) left = right = 0;
    left = Math.max(0, Math.min(11, left));
    right = Math.max(0, Math.min(11, right));
    const half = Math.max(left, right);
    for (let x = cx - left; x <= cx + right; x++) {
      const side = (x - cx) / Math.max(1, x < cx ? left : right);
      let c = PINE.mid;
      if (within < 0.3) c = PINE.deep; // in the shade of the tier above
      if (side < -0.25 && within > 0.35) c = PINE.lit;
      if (side < -0.65 && within > 0.55 && r() < 0.45) c = PINE.glint;
      if (side > 0.35) c = within < 0.5 ? PINE.shadow : PINE.deep;
      if (r() < 0.1) c = shift(c, -10);
      put(img, x, y, c);
    }
    // The tips of each tier droop a pixel at the edges.
    if (within > 0.8 && half > 3) {
      if (r() < 0.7) put(img, cx - left, y + 1, PINE.lit);
      if (r() < 0.7) put(img, cx + right, y + 1, PINE.shadow);
    }
  }
  for (let y = bottom + 1; y < 50; y++) {
    put(img, cx - 1, y, 0x4a3524);
    put(img, cx, y, 0x2e2117);
  }
  outline(img, PINE.ink, PINE.shadow);
  return { img, ax: cx, ay: 49 };
}

const OAK = { ink: 0x171b0e, shadow: 0x2b3319, deep: 0x3b4524, mid: 0x4c572b, lit: 0x5e6b33, glint: 0x76823f };

function oak(variant) {
  const r = rng(200 + variant);
  const img = image(28, 34);
  const cx = 14;
  // Trunk and a branch or two.
  for (let y = 24; y < 34; y++) {
    put(img, cx - 1, y, 0x5a4029);
    put(img, cx, y, 0x45301e);
    put(img, cx + 1, y, 0x33231a);
  }
  if (variant % 2 === 0) for (let i = 0; i < 3; i++) put(img, cx - 2 - i, 24 - i, 0x45301e);
  else for (let i = 0; i < 3; i++) put(img, cx + 2 + i, 24 - i, 0x33231a);
  // The crown: overlapping clumps, each shaded as a ball lit from the upper left.
  const clumps = [];
  const n = int(r, 5, 7);
  for (let i = 0; i < n; i++)
    clumps.push({ x: cx + int(r, -7, 7), y: int(r, 9, 19), rad: int(r, 4, 7) });
  clumps.sort((a, b) => a.y - b.y);
  for (const k of clumps)
    for (let y = k.y - k.rad; y <= k.y + k.rad; y++)
      for (let x = k.x - k.rad; x <= k.x + k.rad; x++) {
        const dx = (x - k.x) / k.rad;
        const dy = (y - k.y) / k.rad;
        const d = dx * dx + dy * dy;
        if (d > 1) continue;
        const light = -dx * 0.6 - dy * 0.8;
        let c = OAK.mid;
        if (light > 0.55) c = OAK.glint;
        else if (light > 0.2) c = OAK.lit;
        else if (light < -0.5) c = OAK.shadow;
        else if (light < -0.15) c = OAK.deep;
        if (d > 0.75 && light < 0) c = OAK.shadow;
        if (r() < 0.12) c = shift(c, r() < 0.5 ? -14 : 10);
        put(img, Math.max(1, Math.min(26, x)), y, c);
      }
  outline(img, OAK.ink, OAK.shadow);
  return { img, ax: cx, ay: 33 };
}

const ROCK = { ink: 0x34322d, shadow: 0x5f5c55, mid: 0x7d7a72, lit: 0x9a968c, glint: 0xb5b1a5, moss: 0x5a6634 };

function boulder(variant) {
  const r = rng(300 + variant);
  const img = image(18, 13);
  const rx = int(r, 5, 8);
  const ry = int(r, 4, 5);
  const cx = 9;
  const cy = 12 - ry;
  for (let y = cy - ry - 1; y <= 12; y++)
    for (let x = cx - rx - 1; x <= cx + rx + 1; x++) {
      const dx = (x - cx) / rx;
      const dy = (y - cy) / (ry + 0.5);
      const bump = Math.sin((x + variant * 3) * 1.7) * 0.12;
      if (dx * dx + dy * dy > 1 + bump || y > 12) continue;
      const light = -dx * 0.6 - dy * 0.8;
      let c = ROCK.mid;
      if (light > 0.55) c = ROCK.glint;
      else if (light > 0.15) c = ROCK.lit;
      else if (light < -0.35) c = ROCK.shadow;
      if (y >= 11 && r() < 0.5) c = ROCK.moss;
      if (r() < 0.1) c = shift(c, -12);
      put(img, x, y, c);
    }
  outline(img, ROCK.ink, ROCK.shadow);
  return { img, ax: cx, ay: 12 };
}

function stones(variant) {
  const r = rng(400 + variant);
  const img = image(16, 7);
  for (let i = 0; i < 3; i++) {
    const cx = 3 + i * 4 + int(r, 0, 1);
    const rx = int(r, 1, 2);
    const cy = 6 - int(r, 0, 1);
    for (let y = cy - 2; y <= cy; y++)
      for (let x = cx - rx; x <= cx + rx; x++) {
        if (y === cy - 2 && (x === cx - rx || x === cx + rx)) continue;
        put(img, x, y, y === cy ? ROCK.shadow : x <= cx && y === cy - 2 ? ROCK.glint : ROCK.lit);
      }
  }
  return { img, ax: 8, ay: 6 };
}

function reeds(variant) {
  const r = rng(500 + variant);
  const img = image(13, 15);
  const n = 5 + variant;
  for (let i = 0; i < n; i++) {
    const x0 = 2 + Math.round((i * 9) / (n - 1));
    const h = int(r, 8, 13);
    const lean = int(r, -1, 1);
    for (let k = 0; k < h; k++) {
      const x = x0 + (k > h / 2 ? lean : 0);
      put(img, x, 14 - k, k < 3 ? 0x5a6230 : i % 2 ? 0x7d8a3c : 0x95a04f);
    }
    if (i % 2 === 0) {
      put(img, x0 + lean, 14 - h, 0x5d4026);
      put(img, x0 + lean, 13 - h, 0x5d4026);
    }
  }
  return { img, ax: 6, ay: 14 };
}

/** Low ground cover: grass, heather and bracken, as on a moor. */
function tuft(variant) {
  const r = rng(600 + variant);
  const img = image(11, 6);
  const sets = [
    [0x56602e, 0x6f7a3a, 0x86904a],
    [0x5a3e40, 0x6f4c4c, 0x87605a],
    [0x6a4220, 0x84552a, 0x9c6a36],
    [0x46512a, 0x5a6633, 0x707e3e],
  ];
  const [dark, mid, lit] = sets[variant % sets.length];
  for (let i = 0; i < 14; i++) {
    const x = int(r, 1, 9);
    const top = int(r, 1, 3) + Math.abs(x - 5) / 2;
    for (let y = Math.round(top); y < 6; y++) put(img, x, y, y === Math.round(top) ? lit : y > 4 ? dark : mid);
  }
  return { img, ax: 5, ay: 5 };
}

// ---------------------------------------------------------------------------------------------

/** Lay sprites out on one sheet, left to right in rows, and describe each frame for the manifest. */
function sheet(groups) {
  const pad = 1;
  const rows = groups.map(([, frames]) => ({ w: frames.reduce((s, f) => s + f.img.width + pad, 0), h: Math.max(...frames.map((f) => f.img.height)) + pad }));
  const out = image(Math.max(...rows.map((r) => r.w)), rows.reduce((s, r) => s + r.h, 0));
  const sprites = {};
  let y = 0;
  groups.forEach(([name, frames], i) => {
    let x = 0;
    sprites[name] = frames.map((f) => {
      for (let py = 0; py < f.img.height; py++)
        for (let px = 0; px < f.img.width; px++) {
          const c = get(f.img, px, py);
          if (c !== null) put(out, x + px, y + py, c);
        }
      const frame = { x, y, w: f.img.width, h: f.img.height, ax: f.ax, ay: f.ay };
      x += f.img.width + pad;
      return frame;
    });
    y += rows[i].h;
  });
  return { img: out, sprites };
}

const range = (n, f) => Array.from({ length: n }, (_, i) => f(i));

mkdirSync(OUT, { recursive: true });

// Files that now hold art from elsewhere (cut down from painted sheets, Oct 2026): this script leaves
// them, and their manifest entries, alone. Take a file off this list to draw it here again.
const KEEP = new Set(['plants.png', 'stone-face.png', ...['grass', 'forest', 'marsh', 'rock', 'ford', 'deep'].map((l) => `ground-${l}.png`)]);
const write = (file, img) => {
  if (KEEP.has(file)) console.log(`Kept ${file} (not drawn by this script)`);
  else writeFileSync(join(OUT, file), encodePng(img));
};
const previous = existsSync(join(OUT, 'manifest.json')) ? JSON.parse(readFileSync(join(OUT, 'manifest.json'), 'utf8')) : null;

const plants = sheet([
  ['pine', range(6, pine)],
  ['oak', range(4, oak)],
  ['boulder', range(4, boulder)],
  ['stones', range(3, stones)],
  ['reeds', range(3, reeds)],
  ['tuft', range(4, tuft)],
]);
write('plants.png', plants.img);

// People: one row per kind and pose, the frames of each animation in order.
const people = sheet(
  Object.keys(PEOPLE).flatMap((kind) => Object.entries(posesFor(kind)).map(([pose, n]) => [`${kind}.${pose}`, range(n, (f) => person(kind, pose, f))])),
);
write('people.png', people.img);

const camp = sheet([
  ['tent', range(3, tent)],
  ['block', range(3, block)],
  ['log', range(3, logEnd)],
  ['cart', [cart(false)]],
  ['cartLoaded', [cart(true)]],
  ['fire', range(4, fire)],
  ['puff', range(3, puff)],
]);
write('camp.png', camp.img);

write('stone-face.png', stoneFace());
write('stone-top.png', stoneTop());
const lands = ['grass', 'forest', 'marsh', 'rock', 'shallow', 'ford', 'deep'];
for (const land of lands) write(`ground-${land}.png`, ground[land]());
const manifest = {
  version: 1,
  sheets: { 'plants.png': KEEP.has('plants.png') && previous ? previous.sheets['plants.png'] : plants.sprites, 'people.png': people.sprites, 'camp.png': camp.sprites },
  textures: {
    stoneFace: 'stone-face.png',
    stoneTop: 'stone-top.png',
    ...Object.fromEntries(lands.map((land) => [`ground.${land}`, `ground-${land}.png`])),
    // The road is grass with a muddy track drawn over it.
    'ground.road': 'ground-grass.png',
  },
};
writeFileSync(join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(`Wrote ${OUT}`);
