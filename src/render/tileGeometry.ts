import { CLIFF_STEP } from '../data/terrain';
import { heightAt, inBounds, terrainAt, type TerrainMap } from '../sim/terrain';
import { isoToScreen } from './iso';

/** Visual height of each corner of a tile's top, in levels (may be half-levels on slopes). */
export interface Corners {
  n: number;
  e: number;
  s: number;
  w: number;
}

export interface Pt {
  x: number;
  y: number;
}

/** 'bank' joins a slope or a water's edge, 'cliff' is a drop of 2+ levels, 'edge' is the map's rim. */
export type FaceKind = 'bank' | 'cliff' | 'edge';

export interface Face {
  /** 'left' faces down-left on screen (the +y edge), 'right' faces down-right (the +x edge). */
  side: 'left' | 'right';
  kind: FaceKind;
  /** Quad: top-start, top-end, bottom-end, bottom-start. */
  points: Pt[];
  /** Level at the top and bottom of each end, for strata lines. */
  levels: { topA: number; topB: number; bottomA: number; bottomB: number };
}

export interface TileShape {
  x: number;
  y: number;
  level: number;
  corners: Corners;
  /** Top quad in screen space: N, E, S, W. */
  top: Pt[];
  faces: Face[];
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** How far below level 0 the map's rim is drawn, so the site reads as a slab of land. */
export const RIM_DEPTH = 1;

// Corner offsets from the tile centre, and the other tiles that share each corner.
const CORNER_SHARERS: Record<keyof Corners, readonly (readonly [number, number])[]> = {
  n: [[-1, -1], [-1, 0], [0, -1]],
  e: [[0, -1], [1, -1], [1, 0]],
  s: [[1, 0], [1, 1], [0, 1]],
  w: [[0, 1], [-1, 1], [-1, 0]],
};
const CORNER_OFFSET: Record<keyof Corners, readonly [number, number]> = {
  n: [-0.5, -0.5],
  e: [0.5, -0.5],
  s: [0.5, 0.5],
  w: [-0.5, 0.5],
};

/**
 * Corner heights for a tile. Each corner is the average height of the tiles sharing it that
 * are within one level of this tile, so slopes become smooth ramps across neighbours, while
 * cliffs (2+ levels) keep sharp edges. Water stays flat, and land does not lean towards it.
 */
export function tileCorners(map: TerrainMap, x: number, y: number): Corners {
  const h = heightAt(map, x, y);
  const out: Corners = { n: h, e: h, s: h, w: h };
  if (terrainAt(map, x, y).water) return out;
  for (const key of ['n', 'e', 's', 'w'] as const) {
    let sum = h;
    let count = 1;
    for (const [dx, dy] of CORNER_SHARERS[key]) {
      const nx = x + dx;
      const ny = y + dy;
      if (!inBounds(map, nx, ny) || terrainAt(map, nx, ny).water) continue;
      const nh = heightAt(map, nx, ny);
      if (Math.abs(nh - h) >= CLIFF_STEP) continue;
      sum += nh;
      count++;
    }
    out[key] = sum / count;
  }
  return out;
}

/** Height of a tile's top at local offset (u, v) in [-0.5, 0.5], blended between the corners. */
export function surfaceLevel(c: Corners, u: number, v: number): number {
  const fu = u + 0.5;
  const fv = v + 0.5;
  const back = c.n + (c.e - c.n) * fu;
  const front = c.w + (c.s - c.w) * fu;
  return back + (front - back) * fv;
}

function cornerPoint(x: number, y: number, key: keyof Corners, level: number): Pt {
  const [ox, oy] = CORNER_OFFSET[key];
  const p = isoToScreen(x + ox, y + oy, level);
  return { x: p.sx, y: p.sy };
}

export function buildTileShape(map: TerrainMap, x: number, y: number): TileShape {
  const corners = tileCorners(map, x, y);
  const level = heightAt(map, x, y);
  const top = (['n', 'e', 's', 'w'] as const).map((k) => cornerPoint(x, y, k, corners[k]));
  const faces: Face[] = [];

  // The two front edges are the only ones the camera can see: +x (E→S) and +y (S→W).
  const edges = [
    { side: 'right', nx: x + 1, ny: y, a: 'e', b: 's', na: 'n', nb: 'w' },
    { side: 'left', nx: x, ny: y + 1, a: 's', b: 'w', na: 'e', nb: 'n' },
  ] as const;
  for (const e of edges) {
    const topA = corners[e.a];
    const topB = corners[e.b];
    let bottomA: number;
    let bottomB: number;
    let kind: FaceKind;
    if (inBounds(map, e.nx, e.ny)) {
      const nc = tileCorners(map, e.nx, e.ny);
      bottomA = Math.min(topA, nc[e.na]);
      bottomB = Math.min(topB, nc[e.nb]);
      kind = level - heightAt(map, e.nx, e.ny) >= CLIFF_STEP ? 'cliff' : 'bank';
    } else {
      bottomA = -RIM_DEPTH;
      bottomB = -RIM_DEPTH;
      kind = 'edge';
    }
    if (topA - bottomA <= 0 && topB - bottomB <= 0) continue;
    faces.push({
      side: e.side,
      kind,
      points: [
        cornerPoint(x, y, e.a, topA),
        cornerPoint(x, y, e.b, topB),
        cornerPoint(x, y, e.b, bottomB),
        cornerPoint(x, y, e.a, bottomA),
      ],
      levels: { topA, topB, bottomA, bottomB },
    });
  }

  const all = [...top, ...faces.flatMap((f) => f.points)];
  return {
    x,
    y,
    level,
    corners,
    top,
    faces,
    minX: Math.min(...all.map((p) => p.x)),
    minY: Math.min(...all.map((p) => p.y)),
    maxX: Math.max(...all.map((p) => p.x)),
    maxY: Math.max(...all.map((p) => p.y)),
  };
}

/** Shapes for every tile, in painter's order (back to front). */
export function buildTileShapes(map: TerrainMap): TileShape[] {
  const shapes: TileShape[] = [];
  for (let d = 0; d < map.width + map.height - 1; d++) {
    for (let x = 0; x < map.width; x++) {
      const y = d - x;
      if (y >= 0 && y < map.height) shapes.push(buildTileShape(map, x, y));
    }
  }
  return shapes;
}

function insidePolygon(px: number, py: number, pts: readonly Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i] as Pt;
    const b = pts[j] as Pt;
    if (a.y > py !== b.y > py && px < ((b.x - a.x) * (py - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

/**
 * The tile drawn at a world-space point, or null. Checks front to back, so a tile hidden
 * behind a cliff is never picked through it; clicking the cliff face picks the tile on top.
 */
export function pickTile(shapes: readonly TileShape[], px: number, py: number): TileShape | null {
  for (let i = shapes.length - 1; i >= 0; i--) {
    const s = shapes[i] as TileShape;
    if (px < s.minX || px > s.maxX || py < s.minY || py > s.maxY) continue;
    if (insidePolygon(px, py, s.top)) return s;
    for (const f of s.faces) if (insidePolygon(px, py, f.points)) return s;
  }
  return null;
}
