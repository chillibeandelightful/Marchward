import { describe, expect, it } from 'vitest';
import { distanceField, downhill, findPath, landCost } from '../src/sim/path';
import type { TerrainId } from '../src/data/terrain';
import type { TerrainMap } from '../src/sim/terrain';

function flat(w: number, h: number, height = 1): TerrainMap {
  return { width: w, height: h, heights: new Array<number>(w * h).fill(height), types: new Array<TerrainId>(w * h).fill('grass') };
}

const at = (m: TerrainMap, x: number, y: number) => y * m.width + x;

describe('land costs', () => {
  it('charges by terrain, more for climbing, and refuses cliffs and deep water', () => {
    const m = flat(4, 1);
    m.types[1] = 'road';
    m.types[2] = 'marsh';
    expect(landCost(m, 0, 1)).toBeCloseTo(0.6);
    expect(landCost(m, 1, 2)).toBe(3);
    m.types[2] = 'grass';
    m.heights[2] = 2;
    expect(landCost(m, 1, 2)).toBeCloseTo(1.5); // one level up
    expect(landCost(m, 2, 1)).toBeCloseTo(0.6); // down is free of the climb
    m.heights[3] = 4;
    expect(landCost(m, 2, 3)).toBeNull(); // a cliff
    m.types[1] = 'deep';
    expect(landCost(m, 0, 1)).toBeNull();
  });
});

describe('finding a way', () => {
  it('goes round a cliff wall through the one gap', () => {
    const m = flat(9, 9);
    for (let y = 0; y < 9; y++) if (y !== 7) m.heights[at(m, 4, y)] = 4;
    const path = findPath(m, at(m, 0, 0), (i) => i === at(m, 8, 0), [8, 0], (a, b) => landCost(m, a, b));
    expect(path).not.toBeNull();
    expect(path).toContain(at(m, 4, 7));
    expect(path?.[0]).toBe(at(m, 0, 0));
    expect(path?.[path.length - 1]).toBe(at(m, 8, 0));
  });

  it('takes a longer road over a shorter trudge through marsh', () => {
    const m = flat(7, 3);
    for (let x = 1; x < 6; x++) m.types[at(m, x, 1)] = 'marsh';
    for (let x = 0; x < 7; x++) m.types[at(m, x, 0)] = 'road';
    const path = findPath(m, at(m, 0, 1), (i) => i === at(m, 6, 1), [6, 1], (a, b) => landCost(m, a, b)) ?? [];
    expect(path.some((i) => i === at(m, 3, 0))).toBe(true);
    expect(path.some((i) => m.types[i] === 'marsh')).toBe(false);
  });

  it('returns null when there is no way at all', () => {
    const m = flat(5, 5);
    for (let y = 0; y < 5; y++) m.types[at(m, 2, y)] = 'deep';
    expect(findPath(m, at(m, 0, 0), (i) => i === at(m, 4, 4), [4, 4], (a, b) => landCost(m, a, b))).toBeNull();
  });

  it('a distance field leads every reachable tile downhill to the target', () => {
    const m = flat(8, 8);
    m.heights[at(m, 3, 3)] = 4; // a pillar to go round
    const cost = (a: number, b: number) => landCost(m, a, b);
    const field = distanceField(m, [at(m, 7, 7)], cost);
    expect(field[at(m, 7, 7)]).toBe(0);
    expect(field[at(m, 3, 3)]).toBe(Infinity);
    let i = at(m, 0, 0);
    for (let n = 0; n < 40 && i !== at(m, 7, 7); n++) i = downhill(m, field, i, cost) ?? i;
    expect(i).toBe(at(m, 7, 7));
    expect(downhill(m, field, at(m, 7, 7), cost)).toBeNull();
  });
});
