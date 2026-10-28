/**
 * Isometric projection: tile grid coordinates to screen pixels. The tile shape and height step
 * come from the active view angle, so the camera can be tilted from one place. Render only:
 * the sim never sees it, and it is not part of saved games.
 */

export type ViewId = 'standard' | 'high' | 'low';

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
  /** Share of the screen's height the sky and hills take across the top at every zoom (0 for none), and the band of haze below it where the far land fades into the moor. */
  sky: number;
  haze: number;
  /** How much closer in than the Standard view the game starts, and the C key goes back to. */
  homeCloser: number;
}

export const VIEWS: Record<ViewId, ViewAngle> = {
  // The original 2:1 diamonds.
  standard: { id: 'standard', name: 'Standard', tileW: 64, tileH: 32, levelH: 16, structureScale: 1, sky: 0, haze: 0, homeCloser: 1 },
  // Looking down more steeply: fatter diamonds (not 2:1, on purpose), a slightly shorter height
  // step for the ground, and much taller stonework, like the castle games of the early '90s. It
  // starts closer in, so the castle fills the view under the sky.
  high: { id: 'high', name: 'High view', tileW: 64, tileH: 40, levelH: 14, structureScale: 1.75, sky: 0.13, haze: 0.06, homeCloser: 2 },
  // Looking across at the castle rather than down on it: flat diamonds, so the ground takes
  // less of the screen and wall faces read tall without much stretching, and more sky.
  low: { id: 'low', name: 'Low view', tileW: 64, tileH: 24, levelH: 18, structureScale: 1.4, sky: 0.2, haze: 0.1, homeCloser: 2 },
};

/** The numbers the tuning panel can change, with their limits and steps. */
export const TUNABLE = {
  tileH: { name: 'Tile depth (smaller is a lower angle)', min: 16, max: 48, step: 1 },
  levelH: { name: 'Ground height step', min: 6, max: 28, step: 1 },
  structureScale: { name: 'Wall and tower height', min: 1, max: 3, step: 0.05 },
  sky: { name: 'Sky', min: 0, max: 0.4, step: 0.01 },
  haze: { name: 'Haze under the sky', min: 0, max: 0.25, step: 0.01 },
} as const;
export type Tunable = keyof typeof TUNABLE;
export type ViewTuning = Partial<Record<Tunable, number>>;

export const VIEW_ORDER: readonly ViewId[] = ['standard', 'high', 'low'];

let active: ViewAngle = VIEWS.standard;
let tuning: Partial<Record<ViewId, ViewTuning>> = {};

export function viewAngle(): ViewAngle {
  return active;
}

/** Change the view angle. Everything drawn in world space has to be rebuilt afterwards. */
export function setViewAngle(id: ViewId): void {
  active = { ...VIEWS[id], ...tuning[id] };
}

/** Changes made in the tuning panel, per view, laid over the presets. Rebuild afterwards, as for `setViewAngle`. */
export function setViewTuning(next: Partial<Record<ViewId, ViewTuning>>): void {
  tuning = next;
  setViewAngle(active.id);
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
