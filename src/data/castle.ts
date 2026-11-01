/** Castle piece stats. Numbers are starting values from DESIGN.md, to tune in playtesting. */

export interface Cost {
  stone: number;
  timber: number;
  /** Worker-days of labour. */
  labour: number;
}

export type Thickness = 'thin' | 'standard' | 'thick';
export type HeightClass = 'low' | 'medium' | 'high';
export type TowerShape = 'square' | 'round';

export const WALL_THICKNESS: Record<Thickness, { name: string; hp: number; stoneMult: number; width: number }> = {
  thin: { name: 'Thin', hp: 100, stoneMult: 1, width: 0.26 },
  standard: { name: 'Standard', hp: 180, stoneMult: 1.6, width: 0.36 },
  thick: { name: 'Thick', hp: 280, stoneMult: 2.3, width: 0.48 },
};

/** `levels` is how many height levels the wall stands above its own ground. */
export const WALL_HEIGHT: Record<HeightClass, { name: string; levels: number; timeMult: number }> = {
  low: { name: 'Low', levels: 1, timeMult: 1 },
  medium: { name: 'Medium', levels: 2, timeMult: 1.5 },
  high: { name: 'High', levels: 3, timeMult: 2.2 },
};

/** One tile of wall at Thin and Low; thickness scales stone, height scales labour. */
export const WALL_BASE_COST: Cost = { stone: 20, timber: 2, labour: 30 };

export const TOWER_SHAPE: Record<
  TowerShape,
  { name: string; hp: number; cost: Cost; batterTaken: number; sapTimeMult: number }
> = {
  square: { name: 'Square', hp: 320, cost: { stone: 60, timber: 8, labour: 100 }, batterTaken: 1, sapTimeMult: 1 },
  round: { name: 'Round', hp: 320, cost: { stone: 66, timber: 6, labour: 140 }, batterTaken: 0.75, sapTimeMult: 1.5 },
};

/** Towers stand a level taller than walls of the same class. */
export const TOWER_HEIGHT: Record<HeightClass, { name: string; levels: number; timeMult: number }> = {
  low: { name: 'Low', levels: 2, timeMult: 1 },
  medium: { name: 'Medium', levels: 3, timeMult: 1.5 },
  high: { name: 'High', levels: 4, timeMult: 2.2 },
};

/**
 * A gatehouse is three tiles wide across its passage (the arch, with a tower either side), passage
 * one tile. Saves from before M6 part 2 keep their one-tile gatehouse as a narrow gate.
 */
export const GATEHOUSE = {
  name: 'Gatehouse',
  hp: 650,
  levels: 3,
  cost: { stone: 150, timber: 40, labour: 320 },
  /** The flanking towers stand this many levels above the arch between them. */
  flankLevels: 1,
  narrow: { name: 'Narrow gatehouse', hp: 400, cost: { stone: 90, timber: 30, labour: 200 } },
};

/** The keep covers KEEP.size × KEEP.size tiles, all of which must be level. */
export const KEEP = { name: 'Keep', hp: 700, levels: 5, size: 2, cost: { stone: 240, timber: 60, labour: 650 } };

/**
 * Height above the approach (levels the top stands over the highest outside ground next to it)
 * decides ladders and archer range. Ladder crews can climb up to this many levels.
 */
export const LADDER_REACH = 1;

/** Extra archer range in tiles, by height above the approach (index = levels; last entry is the cap). */
export const RANGE_BONUS = [0, 0, 1, 2, 3, 3, 4];

export const EARTHWORKS = {
  /** Worker-days to lower or raise one tile by one level. */
  lowerLabour: 15,
  raiseLabour: 10,
  /** Cartloads of spoil made by lowering one tile one level, or used by raising it. */
  spoilPerLevel: 10,
};
