import { describe, expect, it } from 'vitest';
import { EARTHWORKS, WALL_BASE_COST } from '../src/data/castle';
import { EXTRAS } from '../src/data/combat';
import type { TerrainId } from '../src/data/terrain';
import {
  adjustEarthwork,
  checkPlacement,
  createPlan,
  fitExtras,
  pieceAt,
  pieceCost,
  pieceStats,
  placePieces,
  planReport,
  plannedMap,
  removePieceAt,
  shapeEarth,
  viewPlan,
  type PieceSpec,
} from '../src/sim/castle';
import { walkLine } from '../src/sim/site';
import { createSim } from '../src/sim/state';
import type { TerrainMap } from '../src/sim/terrain';

function flatMap(size: number, h = 1, paint: Record<string, TerrainId> = {}): TerrainMap {
  const types: TerrainId[] = [];
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) types.push(paint[`${x},${y}`] ?? 'grass');
  return { width: size, height: size, heights: new Array<number>(size * size).fill(h), types };
}

const wall = (x: number, y: number, thickness: 'thin' | 'standard' | 'thick' = 'standard'): PieceSpec => ({
  kind: 'wall',
  x,
  y,
  thickness,
  height: 'medium',
});

function line(a: [number, number], b: [number, number]): PieceSpec[] {
  const out: PieceSpec[] = [];
  walkLine(a, b, (x, y) => out.push(wall(x, y)));
  return out;
}

/** A square ring of wall from (a, a) to (b, b), with a gatehouse in the middle of the front (+y) side. */
function ring(map: TerrainMap, a: number, b: number) {
  const plan = createPlan(map);
  const mid = Math.floor((a + b) / 2);
  expect(placePieces(map, plan, line([a, a], [b, a])).problem).toBeNull();
  expect(placePieces(map, plan, line([b, a + 1], [b, b])).problem).toBeNull();
  expect(placePieces(map, plan, line([b - 1, b], [a, b])).problem).toBeNull();
  expect(placePieces(map, plan, line([a, b - 1], [a, a + 1])).problem).toBeNull();
  expect(placePieces(map, plan, [{ kind: 'gatehouse', x: mid, y: b, axis: 'y' }]).problem).toBeNull();
  return plan;
}

describe('placing pieces', () => {
  it('places a line of wall and charges stone by thickness', () => {
    const map = flatMap(10);
    const plan = createPlan(map);
    const thin = checkPlacement(map, plan, [wall(1, 1, 'thin')]).cost;
    const thick = checkPlacement(map, plan, [wall(1, 1, 'thick')]).cost;
    expect(thin.stone).toBe(WALL_BASE_COST.stone);
    expect(thick.stone).toBeCloseTo(WALL_BASE_COST.stone * 2.3, 0);
    expect(placePieces(map, plan, line([1, 1], [5, 1])).problem).toBeNull();
    expect(plan.pieces).toHaveLength(5);
  });

  it('refuses water, and charges extra for marsh and clearing forest', () => {
    const map = flatMap(6, 1, { '1,1': 'shallow', '2,2': 'marsh', '3,3': 'forest' });
    const plan = createPlan(map);
    expect(checkPlacement(map, plan, [wall(1, 1)]).problem).toMatch(/water/i);
    const grass = checkPlacement(map, plan, [wall(4, 4)]).cost;
    const marsh = checkPlacement(map, plan, [wall(2, 2)]).cost;
    const forest = checkPlacement(map, plan, [wall(3, 3)]).cost;
    expect(marsh.labour).toBeGreaterThan(grass.labour);
    expect(marsh.stone).toBeGreaterThan(grass.stone);
    expect(forest.timber).toBeLessThan(grass.timber); // clearing gives timber back
  });

  it("won't run a wall across a cliff", () => {
    const map = flatMap(6);
    for (let y = 0; y < 6; y++) for (let x = 3; x < 6; x++) map.heights[y * 6 + x] = 3;
    const plan = createPlan(map);
    expect(checkPlacement(map, plan, line([1, 1], [4, 1])).problem).toMatch(/cliff/);
    // A one-level step is a slope, and fine.
    for (let y = 0; y < 6; y++) for (let x = 3; x < 6; x++) map.heights[y * 6 + x] = 2;
    expect(checkPlacement(map, plan, line([1, 1], [4, 1])).problem).toBeNull();
  });

  it('makes new walls join the existing curtain, but not across a cliff', () => {
    const map = flatMap(8);
    const plan = createPlan(map);
    placePieces(map, plan, line([1, 1], [3, 1]));
    expect(checkPlacement(map, plan, line([1, 5], [3, 5])).problem).toMatch(/join/);
    expect(checkPlacement(map, plan, line([4, 1], [4, 4])).problem).toBeNull();
    map.heights[1 * 8 + 4] = 3; // a cliff right where the new wall would meet the old one
    expect(checkPlacement(map, plan, [wall(4, 1), wall(4, 2)]).problem).not.toBeNull();
  });

  it('allows one keep but more than one gatehouse, and needs level ground for the keep', () => {
    const map = flatMap(10);
    const plan = createPlan(map);
    expect(placePieces(map, plan, [{ kind: 'keep', x: 4, y: 4 }]).problem).toBeNull();
    expect(checkPlacement(map, plan, [{ kind: 'keep', x: 1, y: 1 }]).problem).toMatch(/only one keep/);
    placePieces(map, plan, [{ kind: 'gatehouse', x: 1, y: 8, axis: 'y' }]);
    placePieces(map, plan, line([2, 8], [6, 8]));
    expect(placePieces(map, plan, [{ kind: 'gatehouse', x: 5, y: 8, axis: 'y' }]).problem).toBeNull();
    expect(plan.pieces.filter((p) => p.kind === 'gatehouse')).toHaveLength(2);

    const sloped = flatMap(6);
    sloped.heights[2 * 6 + 3] = 2;
    const p2 = createPlan(sloped);
    expect(checkPlacement(sloped, p2, [{ kind: 'keep', x: 2, y: 2 }]).problem).toMatch(/level/);
    // Earthworks can level it.
    expect(adjustEarthwork(sloped, p2, 3, 2, -1)).toBeNull();
    expect(checkPlacement(sloped, p2, [{ kind: 'keep', x: 2, y: 2 }]).problem).toBeNull();
  });

  it('turns a wall into a tower when a tower is placed on it', () => {
    const map = flatMap(8);
    const plan = createPlan(map);
    placePieces(map, plan, line([1, 1], [4, 1]));
    const result = placePieces(map, plan, [{ kind: 'tower', x: 4, y: 1, shape: 'round', height: 'high' }]);
    expect(result.problem).toBeNull();
    expect(plan.pieces).toHaveLength(4);
    expect(pieceAt(viewPlan(map, plan), 4, 1)?.kind).toBe('tower');
  });

  it('keeps gate passages clear', () => {
    const map = flatMap(8);
    const plan = createPlan(map);
    placePieces(map, plan, [{ kind: 'gatehouse', x: 3, y: 3, axis: 'y' }]);
    expect(checkPlacement(map, plan, [wall(3, 4)]).problem).toMatch(/gate passage/);
    expect(checkPlacement(map, plan, [wall(4, 3)]).problem).toBeNull();
    expect(checkPlacement(map, createPlan(map), [{ kind: 'gatehouse', x: 0, y: 3, axis: 'x' }]).problem).toMatch(/edge/);
  });

  it('removes a piece by any of its tiles', () => {
    const map = flatMap(8);
    const plan = createPlan(map);
    placePieces(map, plan, [{ kind: 'keep', x: 2, y: 2 }]);
    expect(removePieceAt(plan, 3, 3)).toBe(true);
    expect(plan.pieces).toHaveLength(0);
    expect(removePieceAt(plan, 3, 3)).toBe(false);
  });
});

describe('extras built in while placing', () => {
  it('puts the switched-on extras on every piece of a line, and charges for them', () => {
    const map = flatMap(10);
    const plan = createPlan(map);
    const specs = line([1, 1], [5, 1]).map((s) => fitExtras(s, { slits: true, cauldron: false }));
    const plain = checkPlacement(map, plan, line([1, 1], [5, 1])).cost;
    const check = placePieces(map, plan, specs);
    expect(check.problem).toBeNull();
    expect(plan.pieces).toHaveLength(5);
    expect(plan.pieces.every((p) => p.slits && !p.cauldron)).toBe(true);
    expect(check.cost.stone).toBe(plain.stone + 5 * EXTRAS.slits.cost.stone);
    expect(pieceCost(map, plan.pieces[0] as PieceSpec).labour).toBe(pieceCost(map, wall(1, 1)).labour + EXTRAS.slits.cost.labour);
  });

  it('fits towers and the gatehouse too, but never the keep', () => {
    const both = { slits: true, cauldron: true };
    expect(fitExtras({ kind: 'tower', x: 1, y: 1, shape: 'round', height: 'high' }, both)).toMatchObject(both);
    expect(fitExtras({ kind: 'gatehouse', x: 1, y: 1, axis: 'x' }, both)).toMatchObject(both);
    expect(fitExtras({ kind: 'keep', x: 1, y: 1 }, both)).toEqual({ kind: 'keep', x: 1, y: 1 });
    expect(fitExtras(wall(1, 1), {})).toEqual(wall(1, 1));
  });
});

describe('plan report', () => {
  it('knows when the keep is enclosed by the walls and gatehouse', () => {
    const map = flatMap(12);
    const plan = ring(map, 2, 9);
    placePieces(map, plan, [{ kind: 'keep', x: 5, y: 5 }]);
    let report = planReport(map, viewPlan(map, plan));
    expect(report.keepEnclosed).toBe(true);
    expect(report.curtainParts).toBe(1);
    expect(report.ready).toBe(true);

    removePieceAt(plan, 9, 4); // knock two holes in the east wall
    removePieceAt(plan, 9, 6);
    report = planReport(map, viewPlan(map, plan));
    expect(report.keepEnclosed).toBe(false);
    expect(report.curtainParts).toBe(2);
    expect(report.ready).toBe(false);
  });

  it('counts cliffs and deep water as part of the defences', () => {
    const map = flatMap(10);
    // A plateau standing 3 levels up: nobody can climb onto it.
    for (let y = 2; y < 8; y++) for (let x = 2; x < 8; x++) map.heights[y * 10 + x] = 4;
    const plan = createPlan(map);
    placePieces(map, plan, [{ kind: 'keep', x: 4, y: 4 }]);
    expect(planReport(map, viewPlan(map, plan)).keepEnclosed).toBe(true);
  });

  it('flags pieces broken by later earthworks', () => {
    const map = flatMap(8);
    const plan = createPlan(map);
    placePieces(map, plan, [{ kind: 'keep', x: 3, y: 3 }]);
    adjustEarthwork(map, plan, 3, 3, 1);
    const report = planReport(map, viewPlan(map, plan));
    expect(report.problems.map((p) => p.text)).toEqual([expect.stringMatching(/level/)]);
  });
});

describe('piece stats', () => {
  it('measures height above the approach, so a mound makes a wall harder to ladder', () => {
    const map = flatMap(8);
    const plan = createPlan(map);
    const low: PieceSpec = { kind: 'wall', x: 3, y: 3, thickness: 'thin', height: 'low' };
    const flat = pieceStats(viewPlan(map, plan), low);
    expect(flat.aboveApproach).toBe(1);
    expect(flat.ladderable).toBe(true);
    expect(flat.rangeBonus).toBe(0);

    adjustEarthwork(map, plan, 3, 3, 1);
    const mound = pieceStats(viewPlan(map, plan), low);
    expect(mound.aboveApproach).toBe(2);
    expect(mound.ladderable).toBe(false);
    expect(mound.rangeBonus).toBe(1);
  });

  it('lets attackers on higher ground ladder a medium wall', () => {
    const map = flatMap(8);
    map.heights[3 * 8 + 4] = 2; // higher ground beside the wall
    const s = pieceStats(viewPlan(map, createPlan(map)), wall(3, 3));
    expect(s.aboveApproach).toBe(1);
    expect(s.ladderable).toBe(true);
  });

  it('says round towers resist battering and sapping', () => {
    const map = flatMap(6);
    const round = pieceStats(viewPlan(map, createPlan(map)), { kind: 'tower', x: 2, y: 2, shape: 'round', height: 'low' });
    expect(round.notes.join(' ')).toMatch(/battering/);
    expect(round.notes.join(' ')).toMatch(/Sappers/);
  });
});

describe('earthworks', () => {
  it('balances spoil: digging makes it, raising uses it', () => {
    const map = flatMap(6, 2);
    const plan = createPlan(map);
    adjustEarthwork(map, plan, 1, 1, -1);
    adjustEarthwork(map, plan, 1, 1, -1);
    adjustEarthwork(map, plan, 3, 3, 1);
    const report = planReport(map, viewPlan(map, plan));
    expect(report.earthworks).toEqual({
      raised: 1,
      lowered: 2,
      spoil: EARTHWORKS.spoilPerLevel,
      labour: 2 * EARTHWORKS.lowerLabour + EARTHWORKS.raiseLabour,
    });
    expect(plannedMap(map, plan).heights[1 * 6 + 1]).toBe(0);
    expect(map.heights[1 * 6 + 1]).toBe(2); // the real land is untouched until it's dug
  });

  it("can't dig rock, change water, or go past the height limits", () => {
    const map = flatMap(6, 1, { '1,1': 'rock', '2,2': 'deep' });
    const plan = createPlan(map);
    expect(adjustEarthwork(map, plan, 1, 1, -1)).toMatch(/dug/);
    expect(adjustEarthwork(map, plan, 1, 1, 1)).toBeNull(); // rock can be built up
    expect(adjustEarthwork(map, plan, 1, 1, -1)).toBeNull(); // and the fill taken off again
    expect(adjustEarthwork(map, plan, 2, 2, 1)).toMatch(/water/i);
    expect(adjustEarthwork(map, plan, 4, 4, -1)).toBeNull();
    expect(adjustEarthwork(map, plan, 4, 4, -1)).toMatch(/low/);
  });
});

describe('shaping the land', () => {
  function steepest(map: TerrainMap): number {
    let worst = 0;
    for (let y = 0; y < map.height; y++)
      for (let x = 0; x + 1 < map.width; x++) {
        worst = Math.max(worst, Math.abs((map.heights[y * map.width + x] ?? 0) - (map.heights[y * map.width + x + 1] ?? 0)));
        if (y + 1 < map.height)
          worst = Math.max(worst, Math.abs((map.heights[y * map.width + x] ?? 0) - (map.heights[(y + 1) * map.width + x] ?? 0)));
      }
    return worst;
  }

  it('digging one spot again and again widens a pit with walkable sides', () => {
    const map = flatMap(11, 4);
    const plan = createPlan(map);
    for (let i = 0; i < 3; i++) expect(shapeEarth(map, plan, 5, 5, -1).problem).toBeNull();
    const planned = plannedMap(map, plan);
    expect(planned.heights[5 * 11 + 5]).toBe(1);
    expect(planned.heights[5 * 11 + 6]).toBe(2); // the ripple
    expect(planned.heights[5 * 11 + 7]).toBe(3);
    expect(planned.heights[5 * 11 + 8]).toBe(4); // untouched beyond it
    expect(steepest(planned)).toBe(1);
  });

  it('raising builds a mound the same way, and spoil counts every tile moved', () => {
    const map = flatMap(9, 1);
    const plan = createPlan(map);
    shapeEarth(map, plan, 4, 4, 1);
    const second = shapeEarth(map, plan, 4, 4, 1);
    expect(second.changed.length).toBe(5); // the peak and its four neighbours
    expect(steepest(plannedMap(map, plan))).toBe(1);
    expect(planReport(map, viewPlan(map, plan)).earthworks.raised).toBe(6);
  });

  it('leaves existing cliffs alone, and Shift (no ripple) cuts a sheer ditch', () => {
    const map = flatMap(8, 2);
    for (let y = 0; y < 8; y++) map.heights[y * 8 + 6] = 5; // a crag along x = 6
    const plan = createPlan(map);
    shapeEarth(map, plan, 5, 3, -1);
    shapeEarth(map, plan, 5, 3, -1);
    expect(plannedMap(map, plan).heights[3 * 8 + 6]).toBe(5);

    const sheer = createPlan(map);
    shapeEarth(map, sheer, 2, 2, -1, false);
    expect(shapeEarth(map, sheer, 2, 2, -1, false).changed).toEqual([[2, 2]]);
    expect(plannedMap(map, sheer).heights[2 * 8 + 2]).toBe(0);
    expect(plannedMap(map, sheer).heights[2 * 8 + 3]).toBe(2);
  });

  it("stops at ground that can't be dug", () => {
    const map = flatMap(6, 3, { '3,2': 'rock' });
    const plan = createPlan(map);
    shapeEarth(map, plan, 2, 2, -1);
    shapeEarth(map, plan, 2, 2, -1);
    expect(plannedMap(map, plan).heights[2 * 6 + 3]).toBe(3);
  });
});

describe('plan in sim state', () => {
  it('starts empty and round-trips through JSON', () => {
    const sim = createSim(7);
    expect(sim.plan.pieces).toEqual([]);
    placePieces(sim.map, sim.plan, [{ kind: 'keep', x: 36, y: 34 }]);
    adjustEarthwork(sim.map, sim.plan, 30, 30, 1);
    expect(JSON.parse(JSON.stringify(sim))).toEqual(sim);
  });
});
