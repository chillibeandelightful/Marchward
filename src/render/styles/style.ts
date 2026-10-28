import type { TerrainId } from '../../data/terrain';
import type { WorkerType } from '../../data/economy';
import type { FaceKind } from '../tileGeometry';

export type StyleId = 'modern' | 'classic' | 'drab';

/** Colours for one castle piece. Plain stone, or tinted for previews and problems. */
export interface Palette {
  top: number;
  face: number;
  dark: number;
}

/** The ground: fills, banks and cliffs, and the marks drawn on it. */
export interface TerrainColours {
  ground: Record<TerrainId, number>;
  face: Record<FaceKind, number>;
  strata: number;
  road: number;
  fordStone: number;
  puddle: number;
  ripple: number;
  contour: number;
  grid: number;
  hover: number;
  /** How much each tile's brightness wanders, for a gritty or smooth look. */
  grain: number;
  /** Small dark and light flecks on open ground (heather, stones, mud), as in old pixel art. */
  speckle: { dark: number; light: number } | null;
}

export interface CastleColours {
  stone: Palette;
  /** Planned but not yet finished: `top` marks out the footings on the ground, over a `dark` shadow. */
  planned: Palette;
  banner: number;
  scaffold: number;
  /** 'courses' draws faint lines between courses; 'blocks' draws each block with its mortar joints. */
  masonry: 'courses' | 'blocks';
  /** Dark line round every face (0 for none), for a chunky hand-drawn look. */
  outline: number;
}

/** People: soldiers, raiders and workers. */
export interface FigureColours {
  /** Figures are drawn this much bigger than the modern size. */
  scale: number;
  /** A dark edge drawn round each figure, or null for none. */
  outline: number | null;
  tabard: number;
  tabardStripe: number;
  helm: number;
  raider: number;
  hood: number;
  skin: number;
  legs: number;
  steel: number;
  wood: number;
  tunic: Record<WorkerType, number>;
  canvas: number;
  canvasShade: number;
  stoneBlock: number;
  log: number;
}

/** Fire and smoke from fighting. */
export interface EffectColours {
  flame: number;
  flameCore: number;
  smoke: number;
  dust: number;
  oil: number;
  steam: number;
}

/** An overcast sky band with hills behind the map, filling the space round the site. */
export interface Backdrop {
  skyTop: number;
  skyBottom: number;
  farHills: number;
  nearHills: number;
  moor: number;
}

/** Which tree and rock drawings to use. */
export type SpriteSet = 'modern' | 'classic';

/**
 * Everything about how the game looks in one style. Render and UI read the active style;
 * game logic and the sim never see it, and it is not part of saved games.
 */
export interface VisualStyle {
  id: StyleId;
  name: string;
  background: number;
  terrain: TerrainColours;
  castle: CastleColours;
  figures: FigureColours;
  effects: EffectColours;
  sprites: SpriteSet;
  backdrop: Backdrop | null;
  /** Whether the chunky-pixel and limited-palette screen effect is used (its strength is a setting). */
  retro: boolean;
  /** Which page layout the UI uses. */
  ui: 'modern' | 'classic';
}
