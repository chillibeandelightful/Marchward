import type { TerrainId } from '../data/terrain';
import type { FaceKind } from './tileGeometry';

/** Colours for the procedural terrain art. Look only; the rules live in src/data/terrain.ts. */
export const GROUND_COLOUR: Record<TerrainId, number> = {
  grass: 0x6c9c45,
  forest: 0x3f6a32,
  marsh: 0x6f7447,
  rock: 0x8f8b82,
  shallow: 0x5d9fc6,
  ford: 0x6aa9c8,
  deep: 0x2c5d8f,
  road: 0x6c9c45,
};

export const FACE_COLOUR: Record<FaceKind, number> = {
  bank: 0x7b5d3c,
  cliff: 0x77705f,
  edge: 0x4d3b28,
};

export const STRATA_COLOUR = 0x4f4a40;
export const ROAD_COLOUR = 0xc2a273;
export const FORD_STONE_COLOUR = 0xb9ab8c;
export const PUDDLE_COLOUR = 0x3e6b6a;
export const RIPPLE_COLOUR = 0xd8eef7;
export const CONTOUR_COLOUR = 0x2a3a18;
export const GRID_COLOUR = 0x1d2a14;
export const HOVER_COLOUR = 0xfff3b0;

/** Scale an RGB colour's brightness. */
export function shade(colour: number, f: number): number {
  const r = Math.min(255, Math.max(0, Math.round(((colour >> 16) & 0xff) * f)));
  const g = Math.min(255, Math.max(0, Math.round(((colour >> 8) & 0xff) * f)));
  const b = Math.min(255, Math.max(0, Math.round((colour & 0xff) * f)));
  return (r << 16) | (g << 8) | b;
}
