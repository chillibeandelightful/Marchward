// The workers' camp (tents, stone blocks, logs) and the effects of fighting (fire and smoke puffs).
import { image, put } from './png.mjs';
import { int, line, outline, rect, rng, scale } from './kit.mjs';

const INK = 0x15110d;

/** A ridge tent seen from the front corner: a lit left slope, a shaded right slope and a dark doorway. */
export function tent(variant) {
  const r = rng(700 + variant);
  const img = image(42, 30);
  const canvas = [0xc9bc96, 0xbdb08a, 0xc4b48c][variant % 3];
  const peakX = 20;
  const peakY = 2;
  for (let y = peakY; y < 29; y++) {
    const k = (y - peakY) / (29 - peakY);
    const left = Math.round(peakX - k * 19);
    const right = Math.round(peakX + 2 + k * 18);
    const mid = Math.round(peakX + 1 + k * 3);
    for (let x = left; x <= right; x++) {
      let c = x <= mid ? canvas : scale(canvas, 0.74);
      // Folds and weathering in the cloth.
      if ((x + y * 2) % 9 === 0 && x <= mid) c = scale(canvas, 0.92);
      if (r() < 0.05) c = scale(c, 0.9);
      if (y > 26) c = scale(c, 0.8);
      put(img, x, y, c);
    }
  }
  // The doorway on the lit side, and a guy rope.
  for (let y = 16; y < 29; y++) {
    const half = Math.round(((y - 16) / 13) * 3);
    for (let x = 12 - half; x <= 12 + half; x++) put(img, x, y, 0x3a2e22);
  }
  line(img, peakX + 1, peakY, peakX + 1, 28, scale(canvas, 0.6)); // the ridge pole's corner
  line(img, 40, 28, 33, 20, 0x6b5a40);
  outline(img, INK, scale(INK, 1.8));
  return { img, ax: 21, ay: 28 };
}

/** A dressed stone block for the stone pile. */
export function block(variant) {
  const img = image(8, 6);
  const c = [0xa3a098, 0x99958b, 0xaca89c][variant % 3];
  rect(img, 0, 1, 7, 4, c);
  line(img, 0, 1, 6, 1, scale(c, 1.15));
  rect(img, 7, 1, 1, 4, scale(c, 0.7));
  line(img, 1, 0, 7, 0, scale(c, 1.25));
  line(img, 0, 5, 7, 5, scale(c, 0.6));
  return { img, ax: 3, ay: 5 };
}

/** The cut end of a log, for the timber pile. */
export function logEnd(variant) {
  const img = image(6, 6);
  const bark = [0x6e4e2a, 0x5e4426, 0x77552e][variant % 3];
  for (const [x, y] of [[1, 0], [2, 0], [3, 0], [4, 0], [0, 1], [5, 1], [0, 2], [5, 2], [0, 3], [5, 3], [0, 4], [5, 4], [1, 5], [2, 5], [3, 5], [4, 5]]) put(img, x, y, bark);
  rect(img, 1, 1, 4, 4, 0xb08a58);
  put(img, 2, 2, 0x8a6a40);
  put(img, 3, 3, 0x8a6a40);
  put(img, 4, 4, scale(0xb08a58, 0.8));
  return { img, ax: 3, ay: 5 };
}

/** Flames, in four frames that flicker one into the next. */
export function fire(frame) {
  const r = rng(800 + frame);
  const img = image(14, 20);
  const tongues = [
    [4, 12 + int(r, 0, 3)],
    [7, 16 + int(r, 0, 3)],
    [10, 11 + int(r, 0, 3)],
  ];
  for (const [cx, h] of tongues) {
    const lean = [0, 1, 0, -1][(frame + cx) % 4];
    for (let k = 0; k < h; k++) {
      const y = 19 - k;
      const half = Math.max(0, Math.round(3 * (1 - k / h) ** 1.2 + (r() < 0.25 ? -1 : 0)));
      const x0 = cx + Math.round((lean * k) / h * 2);
      for (let x = x0 - half; x <= x0 + half; x++) {
        const core = Math.abs(x - x0) < half * 0.5 && k < h * 0.6;
        put(img, x, y, core ? 0xf8d24a : k > h * 0.75 ? 0xb8401a : 0xe8781e);
      }
    }
  }
  // Sparks.
  for (let i = 0; i < 2; i++) put(img, int(r, 2, 11), int(r, 0, 5), 0xf8d24a);
  return { img, ax: 7, ay: 19 };
}

/** A soft round puff of smoke or dust, lighter at the top left; drawn tinted and faded by the game. */
export function puff(size) {
  const r = rng(900 + size);
  const d = [8, 12, 16][size];
  const img = image(d, d);
  const rad = d / 2 - 0.5;
  for (let y = 0; y < d; y++)
    for (let x = 0; x < d; x++) {
      const dx = (x - rad) / rad;
      const dy = (y - rad) / rad;
      const dist = Math.hypot(dx, dy);
      if (dist > 1) continue;
      // Ragged at the rim: some edge pixels left out, as with old dithered smoke.
      if (dist > 0.8 && r() < 0.45) continue;
      const light = -dx * 0.5 - dy * 0.6;
      const v = light > 0.3 ? 0xe0e0e0 : light > -0.2 ? 0xc4c4c4 : 0xa4a4a4;
      put(img, x, y, v);
    }
  return { img, ax: Math.floor(d / 2), ay: d - 1 };
}
