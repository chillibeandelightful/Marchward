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
}

export const TERRAIN: Record<TerrainId, TerrainType> = {
  grass: { id: 'grass', name: 'Grassland', moveCost: 1, movement: 'Normal', building: 'Normal', water: false },
  forest: {
    id: 'forest',
    name: 'Forest',
    moveCost: 2,
    movement: 'Slow',
    building: 'Clear first (gives timber)',
    water: false,
  },
  marsh: {
    id: 'marsh',
    name: 'Marsh',
    moveCost: 3,
    movement: 'Very slow',
    building: 'Needs piling and drainage',
    water: false,
  },
  rock: { id: 'rock', name: 'Rocky ground', moveCost: 1, movement: 'Normal', building: 'Excellent foundation', water: false },
  shallow: {
    id: 'shallow',
    name: 'Shallow water',
    moveCost: 3,
    movement: 'Very slow',
    building: 'Not possible',
    water: true,
  },
  /** Shallow water where a road crosses. Same rules as shallow water; drawn with a track so it can be found. */
  ford: { id: 'ford', name: 'Ford', moveCost: 3, movement: 'Very slow', building: 'Not possible', water: true },
  deep: { id: 'deep', name: 'Deep water', moveCost: null, movement: 'Impassable', building: 'Not possible', water: true },
  road: { id: 'road', name: 'Road', moveCost: 0.6, movement: 'Fast', building: 'Normal', water: false },
};

/** Height levels run 0..MAX_HEIGHT. */
export const MAX_HEIGHT = 6;
/** A height difference of this much or more between neighbours is a cliff. */
export const CLIFF_STEP = 2;
