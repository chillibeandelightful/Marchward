import type { ViewId } from '../render/iso';
import type { StyleId } from '../render/styles';

/** How the game looks: the visual style, the view angle and, for Classic, how strong the retro screen effect is. Kept per browser, not in saves. */
export interface Look {
  style: StyleId;
  /** Standard (2:1 isometric), or the trial High or Low view. */
  view: ViewId;
  /** Size of the chunky pixels, in screen pixels (1 is off). */
  pixel: 1 | 2 | 3;
  /** Strength of the ordered dithering, from 0 (off) to 1 (full), in steps of 0.05. */
  dither: number;
  /** Dither only big surfaces (the ground, castle stone and sky), leaving trees, figures and effects plain. */
  surfaces: boolean;
  /** Faint lines on the land where it steps up or down a level, like contours on a map. */
  contours: boolean;
}

export const DEFAULT_LOOK: Look = { style: 'modern', view: 'standard', pixel: 2, dither: 1, surfaces: false, contours: false };
const KEY = 'marchward.look';

/** Read stored look settings, falling back to the defaults for anything missing or odd. */
export function parseLook(text: string | null): Look {
  let raw: Partial<Record<keyof Look, unknown>> = {};
  try {
    const v: unknown = text ? JSON.parse(text) : {};
    if (v && typeof v === 'object') raw = v as typeof raw;
  } catch {
    // Unreadable: use the defaults.
  }
  return {
    style: raw.style === 'classic' || raw.style === 'modern' || raw.style === 'drab' || raw.style === 'painted' ? raw.style : DEFAULT_LOOK.style,
    view: raw.view === 'standard' || raw.view === 'high' || raw.view === 'low' ? raw.view : DEFAULT_LOOK.view,
    pixel: raw.pixel === 1 || raw.pixel === 2 || raw.pixel === 3 ? raw.pixel : DEFAULT_LOOK.pixel,
    dither: typeof raw.dither === 'number' && raw.dither >= 0 && raw.dither <= 1 ? Math.round(raw.dither * 20) / 20 : DEFAULT_LOOK.dither,
    surfaces: typeof raw.surfaces === 'boolean' ? raw.surfaces : DEFAULT_LOOK.surfaces,
    contours: typeof raw.contours === 'boolean' ? raw.contours : DEFAULT_LOOK.contours,
  };
}

export function loadLook(): Look {
  try {
    return parseLook(localStorage.getItem(KEY));
  } catch {
    return DEFAULT_LOOK;
  }
}

export function storeLook(look: Look): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(look));
  } catch {
    // Storage off: the choice lasts until the page is closed.
  }
}
