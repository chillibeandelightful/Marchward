import { CLASSIC } from './classic';
import { MODERN } from './modern';
import type { StyleId, VisualStyle } from './style';

export type * from './style';

export const STYLES: Record<StyleId, VisualStyle> = { modern: MODERN, classic: CLASSIC };

let active: VisualStyle = MODERN;

/** The style everything is drawn in right now. Read it at draw time, so a switch takes effect on the next redraw. */
export function style(): VisualStyle {
  return active;
}

export function setStyle(id: StyleId): void {
  active = STYLES[id];
}
