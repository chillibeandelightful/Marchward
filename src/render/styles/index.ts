import { CLASSIC } from './classic';
import { DRAB } from './drab';
import { MODERN } from './modern';
import { PAINTED } from './painted';
import type { StyleId, VisualStyle } from './style';

export type * from './style';

export const STYLES: Record<StyleId, VisualStyle> = { modern: MODERN, classic: CLASSIC, drab: DRAB, painted: PAINTED };

let active: VisualStyle = MODERN;

/** The style everything is drawn in right now. Read it at draw time, so a switch takes effect on the next redraw. */
export function style(): VisualStyle {
  return active;
}

/** The order the L key steps through. */
export const STYLE_ORDER: readonly StyleId[] = ['modern', 'classic', 'drab', 'painted'];

export function setStyle(id: StyleId): void {
  active = STYLES[id];
}
