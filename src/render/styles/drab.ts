import { CLASSIC } from './classic';
import type { VisualStyle } from './style';

/**
 * Classic's drab colours, block-built stone, figures and iron frame, drawn smooth: no chunky pixels
 * and no dithering, so the land stays clear when zoomed out. A stopgap while hand-made art is planned.
 */
export const DRAB: VisualStyle = {
  ...CLASSIC,
  id: 'drab',
  name: 'Drab',
  retro: false,
};
