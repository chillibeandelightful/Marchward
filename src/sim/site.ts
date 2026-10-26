import { MAX_HEIGHT, TERRAIN, type TerrainId } from '../data/terrain';
import { valueNoise } from './noise';
import type { TerrainMap } from './terrain';

export type Point = readonly [number, number];

/**
 * A hand-made site, described as a list of features applied in order.
 * Building from the list (rather than storing every tile) keeps sites easy to read and edit.
 */
export interface SiteDef {
  id: string;
  name: string;
  width: number;
  height: number;
  baseHeight: number;
  features: readonly SiteFeature[];
}

export type SiteFeature =
  /** A smooth rise: heights fall off evenly, so its sides are walkable slopes when radius >= 1.5 * peak. */
  | { kind: 'hill'; at: Point; radius: number; peak: number }
  /** A flat-topped outcrop with sheer sides (cliffs where it stands 2+ above its surroundings). */
  | { kind: 'plateau'; at: Point; radius: number; level: number; ragged?: number }
  /** Repaint a patch with a terrain type, optionally setting its height. */
  | { kind: 'patch'; terrain: TerrainId; at: Point; radius: number; level?: number; ragged?: number }
  /** Water along a path: deep in the middle, shallow at the edges, all at one level. */
  | { kind: 'river'; path: readonly Point[]; width: number; level: number }
  /** A road along a path. Where it crosses water the water becomes a ford. */
  | { kind: 'road'; path: readonly Point[] };

export function buildSite(def: SiteDef): TerrainMap {
  const { width, height } = def;
  const map: TerrainMap = {
    width,
    height,
    heights: new Array<number>(width * height).fill(def.baseHeight),
    types: new Array<TerrainId>(width * height).fill('grass'),
  };

  def.features.forEach((f, salt) => {
    switch (f.kind) {
      case 'hill':
        eachTile(map, (x, y, i) => {
          const d = Math.hypot(x - f.at[0], y - f.at[1]);
          if (d >= f.radius) return;
          const target = Math.round(def.baseHeight + f.peak * (1 - d / f.radius));
          map.heights[i] = Math.max(map.heights[i] ?? 0, target);
        });
        break;
      case 'plateau':
        eachTile(map, (x, y, i) => {
          if (!insideBlob(x, y, f.at, f.radius, f.ragged ?? 0, salt)) return;
          map.heights[i] = Math.max(map.heights[i] ?? 0, f.level);
        });
        break;
      case 'patch':
        eachTile(map, (x, y, i) => {
          if (!insideBlob(x, y, f.at, f.radius, f.ragged ?? 0, salt)) return;
          map.types[i] = f.terrain;
          if (f.level !== undefined) map.heights[i] = f.level;
        });
        break;
      case 'river':
        eachTile(map, (x, y, i) => {
          const d = distanceToPath(x, y, f.path);
          if (d > f.width / 2) return;
          map.heights[i] = f.level;
          map.types[i] = d <= f.width / 2 - 1 ? 'deep' : 'shallow';
        });
        break;
      case 'road':
        for (let s = 0; s + 1 < f.path.length; s++) {
          walkLine(f.path[s] as Point, f.path[s + 1] as Point, (x, y) => {
            if (x < 0 || y < 0 || x >= width || y >= height) return;
            const i = y * width + x;
            map.types[i] = TERRAIN[map.types[i] ?? 'grass'].water ? 'ford' : 'road';
          });
        }
        break;
    }
  });

  map.heights = map.heights.map((h) => Math.min(MAX_HEIGHT, Math.max(0, h)));
  return map;
}

function eachTile(map: TerrainMap, fn: (x: number, y: number, i: number) => void): void {
  for (let y = 0; y < map.height; y++) for (let x = 0; x < map.width; x++) fn(x, y, y * map.width + x);
}

/** A rough disc: its edge wanders in and out by up to `ragged` of the radius. */
function insideBlob(x: number, y: number, at: Point, radius: number, ragged: number, salt: number): boolean {
  const wobble = ragged === 0 ? 0 : ragged * (valueNoise(x, y, salt + 101, 3) * 2 - 1);
  return Math.hypot(x - at[0], y - at[1]) <= radius * (1 + wobble);
}

function distanceToPath(x: number, y: number, path: readonly Point[]): number {
  let best = Infinity;
  for (let s = 0; s + 1 < path.length; s++) {
    const [ax, ay] = path[s] as Point;
    const [bx, by] = path[s + 1] as Point;
    const lx = bx - ax;
    const ly = by - ay;
    const len2 = lx * lx + ly * ly;
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((x - ax) * lx + (y - ay) * ly) / len2));
    best = Math.min(best, Math.hypot(x - (ax + t * lx), y - (ay + t * ly)));
  }
  return best;
}

/** Visit tiles from a to b, inclusive, moving one edge step at a time (so roads join edge to edge). */
export function walkLine(a: Point, b: Point, visit: (x: number, y: number) => void): void {
  let [x, y] = a;
  const dx = Math.abs(b[0] - x);
  const dy = Math.abs(b[1] - y);
  const sx = Math.sign(b[0] - x);
  const sy = Math.sign(b[1] - y);
  let ix = 0;
  let iy = 0;
  visit(x, y);
  while (ix < dx || iy < dy) {
    if (iy >= dy || (ix < dx && (ix + 0.5) / dx < (iy + 0.5) / dy)) {
      x += sx;
      ix++;
    } else {
      y += sy;
      iy++;
    }
    visit(x, y);
  }
}
