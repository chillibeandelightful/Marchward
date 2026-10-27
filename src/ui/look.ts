import type { StyleId } from '../render/styles';

/** How the game looks: the visual style and, for Classic, how strong the retro screen effect is. Kept per browser, not in saves. */
export interface Look {
  style: StyleId;
  /** Size of the chunky pixels, in screen pixels (1 is off). */
  pixel: 1 | 2 | 3;
  /** Ordered dithering: 0 off, 0.5 light, 1 full. */
  dither: 0 | 0.5 | 1;
}

export const DEFAULT_LOOK: Look = { style: 'modern', pixel: 2, dither: 1 };
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
    style: raw.style === 'classic' || raw.style === 'modern' ? raw.style : DEFAULT_LOOK.style,
    pixel: raw.pixel === 1 || raw.pixel === 2 || raw.pixel === 3 ? raw.pixel : DEFAULT_LOOK.pixel,
    dither: raw.dither === 0 || raw.dither === 0.5 || raw.dither === 1 ? raw.dither : DEFAULT_LOOK.dither,
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
