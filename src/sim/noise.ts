/** Deterministic hash of integer coordinates to [0, 1). No state, so it is safe anywhere. */
export function hash2(x: number, y: number, salt = 0): number {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(salt | 0, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** Smooth value noise in [0, 1): hash values on a grid of `cell` tiles, blended between. */
export function valueNoise(x: number, y: number, salt: number, cell: number): number {
  const gx = x / cell;
  const gy = y / cell;
  const x0 = Math.floor(gx);
  const y0 = Math.floor(gy);
  const fx = smooth(gx - x0);
  const fy = smooth(gy - y0);
  const top = lerp(hash2(x0, y0, salt), hash2(x0 + 1, y0, salt), fx);
  const bottom = lerp(hash2(x0, y0 + 1, salt), hash2(x0 + 1, y0 + 1, salt), fx);
  return lerp(top, bottom, fy);
}

function smooth(t: number): number {
  return t * t * (3 - 2 * t);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
