import { COMBAT } from '../data/combat';
import { heightAt, inBounds, NEIGHBOURS, stepBetween, terrainAt, type TerrainMap } from './terrain';

/**
 * Cost of stepping from tile a onto its edge neighbour b (tile indices), or null if it can't be done.
 * Costs are in "tiles of level grass", so they double as walking time at a unit's base speed.
 */
export type StepCost = (a: number, b: number) => number | null;

/**
 * The land's own cost: the terrain being entered (roads are quick, marsh and fords slow), more for
 * climbing, and nothing across a cliff or into deep water.
 */
export function landCost(map: TerrainMap, a: number, b: number): number | null {
  const ax = a % map.width;
  const ay = (a - ax) / map.width;
  const bx = b % map.width;
  const by = (b - bx) / map.width;
  const move = terrainAt(map, bx, by).moveCost;
  if (move === null) return null;
  const ha = heightAt(map, ax, ay);
  const hb = heightAt(map, bx, by);
  if (stepBetween(ha, hb) === 'cliff') return null;
  return move * (1 + COMBAT.climbCost * Math.max(0, hb - ha));
}

/** A small binary heap of tile indices keyed by a number, for the searches below. */
class Heap {
  private items: number[] = [];
  private keys: number[] = [];

  get size(): number {
    return this.items.length;
  }

  push(item: number, key: number): void {
    const { items, keys } = this;
    let i = items.length;
    items.push(item);
    keys.push(key);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if ((keys[p] as number) <= key) break;
      items[i] = items[p] as number;
      keys[i] = keys[p] as number;
      i = p;
    }
    items[i] = item;
    keys[i] = key;
  }

  pop(): number {
    const { items, keys } = this;
    const top = items[0] as number;
    const lastItem = items.pop() as number;
    const lastKey = keys.pop() as number;
    if (items.length > 0) {
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        let mk = lastKey;
        if (l < items.length && (keys[l] as number) < mk) {
          m = l;
          mk = keys[l] as number;
        }
        if (r < items.length && (keys[r] as number) < mk) m = r;
        if (m === i) break;
        items[i] = items[m] as number;
        keys[i] = keys[m] as number;
        i = m;
      }
      items[i] = lastItem;
      keys[i] = lastKey;
    }
    return top;
  }
}

/**
 * A* from one tile to the nearest tile passing `goal`, guided towards `towards`. Returns the tiles
 * walked through (start first, goal last), or null if there is no way.
 */
export function findPath(
  map: TerrainMap,
  from: number,
  goal: (i: number) => boolean,
  towards: readonly [number, number],
  cost: StepCost,
  maxCost = Infinity,
): number[] | null {
  const n = map.width * map.height;
  const g = new Float64Array(n).fill(Infinity);
  const came = new Int32Array(n).fill(-1);
  const closed = new Uint8Array(n);
  const open = new Heap();
  // Roads cost 0.6 a tile, so the guess must not count more than that per tile.
  const h = (i: number) => {
    const x = i % map.width;
    const y = (i - x) / map.width;
    return 0.6 * (Math.abs(x - towards[0]) + Math.abs(y - towards[1]));
  };
  g[from] = 0;
  open.push(from, h(from));
  while (open.size > 0) {
    const i = open.pop();
    if (closed[i]) continue;
    closed[i] = 1;
    if (goal(i)) {
      const path = [i];
      while (path[0] !== from) path.unshift(came[path[0] as number] as number);
      return path;
    }
    const x = i % map.width;
    const y = (i - x) / map.width;
    for (const [dx, dy] of NEIGHBOURS) {
      const nx = x + dx;
      const ny = y + dy;
      if (!inBounds(map, nx, ny)) continue;
      const j = ny * map.width + nx;
      if (closed[j]) continue;
      const c = cost(i, j);
      if (c === null) continue;
      const ng = (g[i] as number) + c;
      if (ng >= (g[j] as number) || ng > maxCost) continue;
      g[j] = ng;
      came[j] = i;
      open.push(j, ng + h(j));
    }
  }
  return null;
}

/**
 * Cost of the cheapest way from every tile to the nearest of `targets` (Dijkstra, run backwards
 * from the targets), plus that target's `start` cost if given. Infinity where there's no way. Units follow it downhill, one tile at a time.
 */
export function distanceField(map: TerrainMap, targets: readonly number[], cost: StepCost, start?: (t: number) => number): Float64Array {
  const dist = new Float64Array(map.width * map.height).fill(Infinity);
  const open = new Heap();
  // Each target can start with a cost of its own, so nearer-but-worse targets can lose to better ones.
  for (const t of targets) {
    const d = start ? start(t) : 0;
    if (d >= (dist[t] as number)) continue;
    dist[t] = d;
    open.push(t, d);
  }
  const done = new Uint8Array(dist.length);
  while (open.size > 0) {
    const b = open.pop();
    if (done[b]) continue;
    done[b] = 1;
    const x = b % map.width;
    const y = (b - x) / map.width;
    for (const [dx, dy] of NEIGHBOURS) {
      const nx = x + dx;
      const ny = y + dy;
      if (!inBounds(map, nx, ny)) continue;
      const a = ny * map.width + nx;
      if (done[a]) continue;
      // The cost of walking a -> b, since units will walk towards the targets.
      const c = cost(a, b);
      if (c === null) continue;
      const nd = (dist[b] as number) + c;
      if (nd < (dist[a] as number)) {
        dist[a] = nd;
        open.push(a, nd);
      }
    }
  }
  return dist;
}

/** The neighbour to step to next when following a distance field, or null at the bottom (or with no way on). */
export function downhill(map: TerrainMap, field: Float64Array, i: number, cost: StepCost): number | null {
  const x = i % map.width;
  const y = (i - x) / map.width;
  let best: number | null = null;
  let bestCost = Infinity;
  const here = field[i] as number;
  for (const [dx, dy] of NEIGHBOURS) {
    const nx = x + dx;
    const ny = y + dy;
    if (!inBounds(map, nx, ny)) continue;
    const j = ny * map.width + nx;
    const c = cost(i, j);
    if (c === null) continue;
    const total = c + (field[j] as number);
    if ((field[j] as number) < here && total < bestCost) {
      best = j;
      bestCost = total;
    }
  }
  return best;
}
