// Small drawing helpers shared by the art tools.
import { get, put } from './png.mjs';

/** A small seeded random number generator, so the art comes out the same every run. */
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const int = (r, lo, hi) => lo + Math.floor(r() * (hi - lo + 1));

/** Lighten (amount > 0) or darken a colour by a number of steps out of 255, per channel. */
export function shift(c, amount) {
  const ch = (v) => Math.max(0, Math.min(255, v + amount));
  return (ch((c >> 16) & 0xff) << 16) | (ch((c >> 8) & 0xff) << 8) | ch(c & 0xff);
}

/** Scale a colour's brightness. */
export function scale(c, f) {
  const ch = (v) => Math.max(0, Math.min(255, Math.round(v * f)));
  return (ch((c >> 16) & 0xff) << 16) | (ch((c >> 8) & 0xff) << 8) | ch(c & 0xff);
}

/** Give every drawn pixel on the edge of the shape a dark outline: darkest on the shadow side. */
export function outline(img, dark, soft) {
  const edge = [];
  for (let y = 0; y < img.height; y++)
    for (let x = 0; x < img.width; x++) {
      if (get(img, x, y) === null) continue;
      const right = get(img, x + 1, y) === null;
      const below = get(img, x, y + 1) === null;
      const left = get(img, x - 1, y) === null;
      const above = get(img, x, y - 1) === null;
      if (right || below) edge.push([x, y, dark]);
      else if (left || above) edge.push([x, y, soft]);
    }
  for (const [x, y, c] of edge) put(img, x, y, c);
}

/** A one-pixel line. */
export function line(img, x0, y0, x1, y1, c) {
  const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
  for (let i = 0; i <= n; i++) put(img, Math.round(x0 + ((x1 - x0) * i) / n), Math.round(y0 + ((y1 - y0) * i) / n), c);
}

export function rect(img, x0, y0, w, h, c) {
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) put(img, x, y, c);
}

/** A dark rim drawn just outside the shape (touching it side-on), so thin parts keep their colour. */
export function rim(img, ink) {
  const add = [];
  for (let y = 0; y < img.height; y++)
    for (let x = 0; x < img.width; x++) {
      if (get(img, x, y) !== null) continue;
      if (get(img, x + 1, y) !== null || get(img, x - 1, y) !== null || get(img, x, y + 1) !== null || get(img, x, y - 1) !== null) add.push([x, y]);
    }
  for (const [x, y] of add) put(img, x, y, ink);
}
