import { DRAB } from './drab';
import type { VisualStyle } from './style';

/**
 * Drab's colours and frame with the hand-made art from `public/art/`: painted stone on every
 * castle piece, and drawn trees, rocks and plants. Anything without art yet is drawn as in Drab.
 */
export const PAINTED: VisualStyle = {
  ...DRAB,
  id: 'painted',
  name: 'Painted',
  castle: { ...DRAB.castle, masonry: 'painted' },
  sprites: 'painted',
};
