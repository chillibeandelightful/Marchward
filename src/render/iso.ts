/**
 * Isometric projection: tile grid coordinates to screen pixels. The tile shape and height step
 * come from the active view angle, so the camera can be tilted from one place. Render only:
 * the sim never sees it, and it is not part of saved games.
 */

export type ViewId = 'standard' | 'high';

export interface ViewAngle {
  id: ViewId;
  name: string;
  /** Width and height of one tile's diamond, in world pixels. */
  tileW: number;
  tileH: number;
  /** How far one level of ground height lifts a point on screen. */
  levelH: number;
  /** Castle pieces are drawn this many times their height in levels, so they stand up next to their footprint. Art only. */
  structureScale: number;
  /** Whether the sky and hills stay across the top of the screen at every zoom. */
  horizon: boolean;
  /** How much closer in than the Standard view the game starts, and the C key goes back to. */
  homeCloser: number;
}

export const VIEWS: Record<ViewId, ViewAngle> = {
  // The original 2:1 diamonds.
  standard: { id: 'standard', name: 'Standard', tileW: 64, tileH: 32, levelH: 16, structureScale: 1, horizon: false, homeCloser: 1 },
  // Looking down more steeply: fatter diamonds (not 2:1, on purpose), a slightly shorter height
  // step for the ground, and much taller stonework, like the castle games of the early '90s. It
  // starts closer in, so the castle fills the view under the sky.
  high: { id: 'high', name: 'High view', tileW: 64, tileH: 40, levelH: 14, structureScale: 1.75, horizon: true, homeCloser: 2 },
};

export const VIEW_ORDER: readonly ViewId[] = ['standard', 'high'];

let active: ViewAngle = VIEWS.standard;

export function viewAngle(): ViewAngle {
  return active;
}

/** Change the view angle. Everything drawn in world space has to be rebuilt afterwards. */
export function setViewAngle(id: ViewId): void {
  active = VIEWS[id];
}

export function isoToScreen(x: number, y: number, level = 0): { sx: number; sy: number } {
  return {
    sx: (x - y) * (active.tileW / 2),
    sy: (x + y) * (active.tileH / 2) - level * active.levelH,
  };
}

/** Screen pixels between one whole level and the next. */
export function levelPx(): number {
  return active.levelH;
}

/** How many levels tall a castle piece of `levels` levels is drawn in the active view. */
export function drawnLevels(levels: number): number {
  return levels * active.structureScale;
}
