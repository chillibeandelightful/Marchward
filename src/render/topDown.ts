import { TILE_H, TILE_W } from './iso';

/**
 * The flat top-down plan view, used while placing castle pieces and troops. Plain maths here
 * (no PixiJS) so it can be tested; the drawing is in topDownView.ts.
 */

/** Size of one tile in the top-down view, in world pixels: as wide as an isometric tile, so switching keeps the scale. Tile (x, y) covers [x, x+1) × [y, y+1) times this. */
export const PLAN_TILE = 64;

/** Tools that place castle pieces or troops: the ones the top-down view is for. */
const PLACING = new Set(['wall', 'tower', 'gatehouse', 'keep']);

/**
 * Should the top-down view be shown? While placing pieces outside a battle, and while posting
 * troops before the fight starts (including the pause after raiders arrive). Never once the
 * fighting has begun, so the battle is always watched in the normal view.
 */
export function wantsTopDown(tool: string, battle: 'deploy' | 'fight' | null): boolean {
  if (tool === 'troops') return battle !== 'fight';
  return PLACING.has(tool) && battle === null;
}

/** Tile coordinates (fractional, at ground level 0) under a point of the isometric world. */
export function isoToTile(sx: number, sy: number): { x: number; y: number } {
  return { x: sy / TILE_H + sx / TILE_W, y: sy / TILE_H - sx / TILE_W };
}

/** The isometric world point over fractional tile coordinates (x, y) at ground level 0. */
export function tileToIso(x: number, y: number): { x: number; y: number } {
  return { x: (x - y) * (TILE_W / 2), y: (x + y) * (TILE_H / 2) };
}

/** The top-down world point at the centre of tile (x, y), or at fractional tile coordinates. */
export function tileToPlan(x: number, y: number): { x: number; y: number } {
  return { x: (x + 0.5) * PLAN_TILE, y: (y + 0.5) * PLAN_TILE };
}

/** Fractional tile coordinates under a top-down world point (tile centres are whole numbers). */
export function planToTile(px: number, py: number): { x: number; y: number } {
  return { x: px / PLAN_TILE - 0.5, y: py / PLAN_TILE - 0.5 };
}

/** The tile under a top-down world point, or null off the map. */
export function pickPlanTile(width: number, height: number, px: number, py: number): { x: number; y: number } | null {
  const x = Math.floor(px / PLAN_TILE);
  const y = Math.floor(py / PLAN_TILE);
  return x >= 0 && y >= 0 && x < width && y < height ? { x, y } : null;
}
