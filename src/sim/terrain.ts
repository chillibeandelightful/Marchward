import { CLIFF_STEP, TERRAIN, type TerrainId, type TerrainType } from '../data/terrain';

/** The land of a site. Plain data, row-major, so it serialises straight into saves. */
export interface TerrainMap {
  width: number;
  height: number;
  /** Height level per tile. */
  heights: number[];
  types: TerrainId[];
}

export type Step = 'flat' | 'slope' | 'cliff';

/** The four edge neighbours, in a fixed order. */
export const NEIGHBOURS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const;

export function inBounds(map: TerrainMap, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < map.width && y < map.height;
}

/** Height of a tile; 0 off the map. */
export function heightAt(map: TerrainMap, x: number, y: number): number {
  if (!inBounds(map, x, y)) return 0;
  return map.heights[y * map.width + x] ?? 0;
}

/** Terrain of a tile; grass off the map. */
export function terrainAt(map: TerrainMap, x: number, y: number): TerrainType {
  if (!inBounds(map, x, y)) return TERRAIN.grass;
  return TERRAIN[map.types[y * map.width + x] ?? 'grass'];
}

/** How two neighbouring heights meet: a difference of 1 is a walkable slope, 2 or more a cliff. */
export function stepBetween(a: number, b: number): Step {
  const d = Math.abs(a - b);
  if (d === 0) return 'flat';
  return d >= CLIFF_STEP ? 'cliff' : 'slope';
}

/** Can a unit step from one tile onto an edge neighbour? Ignores units; just land and water. */
export function canStep(map: TerrainMap, x: number, y: number, nx: number, ny: number): boolean {
  if (!inBounds(map, nx, ny)) return false;
  if (terrainAt(map, nx, ny).moveCost === null) return false;
  return stepBetween(heightAt(map, x, y), heightAt(map, nx, ny)) !== 'cliff';
}

/** The steepest way this tile meets its edge neighbours. */
export function groundShape(map: TerrainMap, x: number, y: number): Step {
  const h = heightAt(map, x, y);
  let worst: Step = 'flat';
  for (const [dx, dy] of NEIGHBOURS) {
    const nx = x + dx;
    const ny = y + dy;
    if (!inBounds(map, nx, ny)) continue;
    const s = stepBetween(h, heightAt(map, nx, ny));
    if (s === 'cliff') return 'cliff';
    if (s === 'slope') worst = 'slope';
  }
  return worst;
}
