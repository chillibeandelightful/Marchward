/** Terrain types and their rules. Numbers are starting values to tune in playtesting. */
export type TerrainId = 'grass' | 'forest' | 'marsh' | 'rock' | 'shallow' | 'ford' | 'deep' | 'road';

export interface TerrainType {
  id: TerrainId;
  name: string;
  /** Movement cost multiplier for pathfinding (M4); null means impassable. */
  moveCost: number | null;
  /** Plain-words labels for the tile readout. */
  movement: string;
  building: string;
  water: boolean;
  /** Can castle pieces stand here? */
  buildable: boolean;
  /** Extra cost per footprint tile to prepare the ground (negative timber is timber gained). */
  groundwork: { stone: number; timber: number; labour: number };
  /** Can earthworks raise or lower this tile? */
  canRaise: boolean;
  canLower: boolean;
  /** Plain-words foundation note for the designer. */
  foundation: string;
}

const NONE = { stone: 0, timber: 0, labour: 0 };
const OPEN = { buildable: true, groundwork: NONE, canRaise: true, canLower: true };
const WET = { buildable: false, groundwork: NONE, canRaise: false, canLower: false, foundation: 'Cannot build in water' };

export const TERRAIN: Record<TerrainId, TerrainType> = {
  grass: {
    id: 'grass',
    name: 'Grassland',
    moveCost: 1,
    movement: 'Normal',
    building: 'Normal',
    water: false,
    ...OPEN,
    foundation: 'Good ground',
  },
  forest: {
    id: 'forest',
    name: 'Forest',
    moveCost: 2,
    movement: 'Slow',
    building: 'Clear first (gives timber)',
    water: false,
    ...OPEN,
    groundwork: { stone: 0, timber: -8, labour: 15 },
    foundation: 'Trees cleared first: extra labour, gives timber',
  },
  marsh: {
    id: 'marsh',
    name: 'Marsh',
    moveCost: 3,
    movement: 'Very slow',
    building: 'Needs piling and drainage',
    water: false,
    ...OPEN,
    groundwork: { stone: 6, timber: 10, labour: 35 },
    foundation: 'Soft: needs piling and drainage first',
  },
  rock: {
    id: 'rock',
    name: 'Rocky ground',
    moveCost: 1,
    movement: 'Normal',
    building: 'Excellent foundation',
    water: false,
    ...OPEN,
    canLower: false,
    foundation: 'Excellent: cannot be undermined',
  },
  shallow: {
    id: 'shallow',
    name: 'Shallow water',
    moveCost: 3,
    movement: 'Very slow',
    building: 'Not possible',
    water: true,
    ...WET,
  },
  /** Shallow water where a road crosses. Same rules as shallow water; drawn with a track so it can be found. */
  ford: { id: 'ford', name: 'Ford', moveCost: 3, movement: 'Very slow', building: 'Not possible', water: true, ...WET },
  deep: {
    id: 'deep',
    name: 'Deep water',
    moveCost: null,
    movement: 'Impassable',
    building: 'Not possible',
    water: true,
    ...WET,
  },
  road: {
    id: 'road',
    name: 'Road',
    moveCost: 0.6,
    movement: 'Fast',
    building: 'Normal',
    water: false,
    ...OPEN,
    foundation: 'Good ground',
  },
};

/** Height levels run 0..MAX_HEIGHT. */
export const MAX_HEIGHT = 6;
/** A height difference of this much or more between neighbours is a cliff. */
export const CLIFF_STEP = 2;
