/** Isometric projection: tile grid coordinates to screen pixels (2:1 diamonds). */
export const TILE_W = 64;
export const TILE_H = 32;
export const LEVEL_H = 16;

export function isoToScreen(x: number, y: number, level = 0): { sx: number; sy: number } {
  return {
    sx: (x - y) * (TILE_W / 2),
    sy: (x + y) * (TILE_H / 2) - level * LEVEL_H,
  };
}
