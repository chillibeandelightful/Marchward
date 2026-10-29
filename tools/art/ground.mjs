// Ground textures: one repeating 64 × 64 patch per kind of land, laid over each tile on screen. They
// are drawn a quarter brighter than the land's colour, because the game darkens them to shade slopes
// (it can darken a texture but not lighten it).
import { image, put } from './png.mjs';
import { int, rng, scale } from './kit.mjs';

const SIZE = 64;
const BRIGHT = 1.25;

/** Smooth, seamlessly repeating noise from a few waves that fit the patch exactly. */
function waves(seed) {
  const r = rng(seed);
  const list = Array.from({ length: 6 }, () => ({ kx: int(r, -3, 3), ky: int(r, 1, 3), ph: r() * Math.PI * 2, a: 0.4 + r() * 0.6 }));
  const total = list.reduce((s, w) => s + w.a, 0);
  return (x, y) => list.reduce((s, w) => s + w.a * Math.sin(((w.kx * x + w.ky * y) / SIZE) * Math.PI * 2 + w.ph), 0) / total;
}

function patch(seed, base, paint) {
  const img = image(SIZE, SIZE);
  const r = rng(seed);
  const n = waves(seed + 1);
  for (let y = 0; y < SIZE; y++)
    for (let x = 0; x < SIZE; x++) {
      // Broad patches of lighter and darker ground.
      const c = scale(base, 1 + n(x, y) * 0.1);
      put(img, x, y, c);
    }
  paint(img, r, n);
  // Brighten the whole patch so the game's shading has room to darken it.
  for (let i = 0; i < img.rgba.length; i += 4) for (let k = 0; k < 3; k++) img.rgba[i + k] = Math.min(255, Math.round(img.rgba[i + k] * BRIGHT));
  return img;
}

const wrap = (v) => ((v % SIZE) + SIZE) % SIZE;

/** Scatter `count` marks drawn by `mark(x, y)` at random, wrapping round the patch. */
function scatter(img, r, count, mark) {
  for (let i = 0; i < count; i++) mark(int(r, 0, SIZE - 1), int(r, 0, SIZE - 1));
}

const dot = (img, x, y, c) => put(img, wrap(x), wrap(y), c);

/** Moorland grass: olive with darker hollows, light blades, and a scatter of heather and dead bracken. */
export function grass() {
  return patch(1001, 0x5e5a30, (img, r) => {
    scatter(img, r, 160, (x, y) => dot(img, x, y, 0x48441f));
    scatter(img, r, 90, (x, y) => {
      dot(img, x, y, 0x7a7444);
      dot(img, x, y - 1, 0x6c6738);
    });
    scatter(img, r, 14, (x, y) => {
      dot(img, x, y, 0x6b4a4a);
      dot(img, x + 1, y, 0x5a3e40);
    });
    scatter(img, r, 10, (x, y) => {
      dot(img, x, y, 0x84552a);
      dot(img, x, y - 1, 0x6a4220);
    });
  });
}

/** The forest floor: dark, with needle litter and moss. */
export function forest() {
  return patch(1002, 0x3f4326, (img, r) => {
    scatter(img, r, 200, (x, y) => dot(img, x, y, 0x2e301a));
    scatter(img, r, 70, (x, y) => {
      dot(img, x, y, 0x4a3b22);
      dot(img, x + 1, y, 0x4a3b22);
    });
    scatter(img, r, 50, (x, y) => dot(img, x, y, 0x55602f));
  });
}

/** Marsh: soggy olive with pools of dark water and tufts of sedge. */
export function marsh() {
  return patch(1003, 0x4d5034, (img, r, n) => {
    for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) if (n(x, y) > 0.35) put(img, x, y, (x + y) % 3 === 0 ? 0x3e4e48 : 0x34443f);
    scatter(img, r, 60, (x, y) => {
      dot(img, x, y, 0x6a7436);
      dot(img, x, y - 1, 0x6a7436);
    });
    scatter(img, r, 80, (x, y) => dot(img, x, y, 0x3c3f27));
  });
}

/** Bare rock and scree: grey-brown gravel with pebbles and cracks. */
export function rock() {
  return patch(1004, 0x74716a, (img, r) => {
    scatter(img, r, 220, (x, y) => dot(img, x, y, 0x5c5953));
    scatter(img, r, 120, (x, y) => dot(img, x, y, 0x8c8980));
    scatter(img, r, 26, (x, y) => {
      dot(img, x, y, 0x9a968c);
      dot(img, x + 1, y, 0x8c8980);
      dot(img, x, y + 1, 0x4e4b45);
      dot(img, x + 1, y + 1, 0x4e4b45);
    });
    scatter(img, r, 8, (x, y) => {
      for (let k = 0; k < 5; k++) dot(img, x + k, y + (k > 2 ? 1 : 0), 0x4e4b45);
    });
    scatter(img, r, 20, (x, y) => dot(img, x, y, 0x5d6a34));
  });
}

/** Water: slate, with light ripples running across and darker troughs. */
function water(seed, base) {
  return patch(seed, base, (img, r) => {
    scatter(img, r, 40, (x, y) => {
      const len = int(r, 3, 6);
      for (let k = 0; k < len; k++) dot(img, x + k, y, scale(base, 1.35));
    });
    scatter(img, r, 40, (x, y) => {
      const len = int(r, 3, 7);
      for (let k = 0; k < len; k++) dot(img, x + k, y, scale(base, 0.8));
    });
  });
}

export const shallow = () => water(1005, 0x4e6272);
export const ford = () => water(1006, 0x5a6c7a);
export const deep = () => water(1007, 0x33475a);
