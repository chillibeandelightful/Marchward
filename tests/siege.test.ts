import { describe, expect, it } from 'vitest';
import { EARTHWORKS } from '../src/data/castle';
import { RAIDS, SIEGE, type RaiderType } from '../src/data/combat';
import type { TerrainId } from '../src/data/terrain';
import { chooseApproach } from '../src/sim/battle';
import {
  createPlan,
  earthworkLabour,
  finishMoat,
  markMoat,
  moatProblem,
  pieceStats,
  placePieces,
  sapSeconds,
  unmarkMoat,
  viewPlan,
  type PieceSpec,
} from '../src/sim/castle';
import { addPost, describeStrength, raidStrength } from '../src/sim/defence';
import { Rng } from '../src/sim/rng';
import { fromSave, SAVE_VERSION } from '../src/sim/save';
import { createSim, raidNow, stepSim, type SimState } from '../src/sim/state';
import type { TerrainMap } from '../src/sim/terrain';
import { listJobs, workDay } from '../src/sim/works';
import { build, fight } from './helpers';

const SIZE = 24;

function flat(size = SIZE, type: TerrainId = 'grass'): TerrainMap {
  return { width: size, height: size, heights: new Array<number>(size * size).fill(1), types: new Array<TerrainId>(size * size).fill(type) };
}

/**
 * A flat field with a wall right across it at x = 12 and the keep beyond it, as in the battle tests.
 * Raiders come from the north-west edge (x = 0). No soldiers unless a test adds them.
 */
function field(wall: (y: number) => Partial<Extract<PieceSpec, { kind: 'wall' }>> = () => ({}), seed = 5, extra: PieceSpec[] = []): SimState {
  const s = createSim(seed);
  const map = flat();
  s.map = map;
  s.plan = createPlan(map);
  s.camp = [20, 20];
  s.economy.troops = { swordsman: 0, archer: 0 };
  s.economy.troopsWanted = { swordsman: 0, archer: 0 };
  s.defence.from = 'north-west';
  for (let y = 0; y < SIZE; y++)
    expect(placePieces(map, s.plan, [{ kind: 'wall', x: 12, y, thickness: 'standard', height: 'medium', ...wall(y) }]).problem).toBeNull();
  expect(placePieces(map, s.plan, [{ kind: 'keep', x: 18, y: 10 }]).problem).toBeNull();
  for (const e of extra) expect(placePieces(map, s.plan, [e]).problem).toBeNull();
  build(s);
  return s;
}

/** Start raid `n` (from 1), keeping only the kinds of raider given. */
function raidWith(s: SimState, n: number, keep: readonly RaiderType[]) {
  s.defence.raidCount = n - 1;
  raidNow(s);
  const b = s.defence.battle;
  if (!b) throw new Error('no battle');
  b.units = b.units.filter((u) => u.side === 'defender' || keep.includes(u.type as RaiderType));
  for (const t of ['raider', 'raiderArcher', 'sapper', 'ladderCrew'] as const) b.stats.start[t] = keep.includes(t) ? b.stats.start[t] : 0;
  b.version++; // so the raiders' plans are worked out for who is left
  return b;
}

function seconds(s: SimState, n: number): void {
  for (let i = 0; i < n * 30 && s.defence.battle; i++) stepSim(s);
}

function report(s: SimState) {
  const r = s.defence.reports[s.defence.reports.length - 1];
  if (!r) throw new Error('no report');
  return r;
}

describe('who comes', () => {
  it('sappers and ladder crews only come from the second raid on', () => {
    expect(raidStrength(1).sapper).toBe(0);
    expect(raidStrength(1).ladderCrew).toBe(0);
    expect(raidStrength(2).sapper).toBeGreaterThan(0);
    expect(raidStrength(2).ladderCrew).toBeGreaterThan(0);
    expect(raidStrength(6).sapper).toBeGreaterThan(raidStrength(2).sapper);
    expect(describeStrength(raidStrength(1))).not.toMatch(/sapper/);
    expect(describeStrength(raidStrength(2))).toMatch(/1 sapper and 2 ladder crews$/);
  });
});

describe('moats', () => {
  it('can be dug on open ground, not on rock, in water or under a piece', () => {
    const map = flat(8);
    map.types[1 * 8 + 1] = 'rock';
    map.types[2 * 8 + 2] = 'shallow';
    const plan = createPlan(map);
    expect(placePieces(map, plan, [{ kind: 'wall', x: 5, y: 5, thickness: 'thin', height: 'low' }]).problem).toBeNull();
    expect(moatProblem(map, plan, 1, 1)).toMatch(/Rocky/);
    expect(moatProblem(map, plan, 2, 2)).toMatch(/water/);
    expect(moatProblem(map, plan, 5, 5)).toMatch(/built/);
    expect(markMoat(map, plan, 4, 4)).toBeNull();
    expect(plan.earthworks[4 * 8 + 4]).toBe(-1);
    expect(markMoat(map, plan, 4, 4)).toMatch(/already planned/);
    // Nothing can be built on a planned moat.
    expect(placePieces(map, plan, [{ kind: 'wall', x: 4, y: 4, thickness: 'thin', height: 'low' }]).problem).toMatch(/moat/i);
    expect(unmarkMoat(map, plan, 4, 4)).toBe(true);
    expect(plan.earthworks[4 * 8 + 4]).toBe(0);
    expect(plan.moats).toEqual([]);
  });

  it('take longer to dig than plain lowering, and are dug by the workers into a dry ditch', () => {
    const s = createSim(3);
    s.map = flat(8);
    s.plan = createPlan(s.map);
    expect(markMoat(s.map, s.plan, 3, 3)).toBeNull();
    const i = 3 * 8 + 3;
    expect(earthworkLabour(s.plan, i, -1)).toBe(EARTHWORKS.lowerLabour * SIEGE.moatLabour);
    const job = listJobs(s.map, s.plan, s.works).find((j) => j.tile === i);
    expect(job?.name).toMatch(/^Dig moat/);
    s.economy.workers.digger = 10;
    s.economy.workers.labourer = 10;
    for (let d = 0; d < 20 && s.plan.moats.length > 0; d++) workDay(s.map, s.plan, s.economy, s.works);
    expect(s.plan.moats).toEqual([]);
    expect(s.map.types[i]).toBe('ditch');
    expect(s.map.heights[i]).toBe(0);
  });

  it('fill with water where they meet water at their level, and the water runs on along them', () => {
    const map = flat(6);
    map.types[0] = 'shallow';
    map.heights[0] = 0;
    // A ditch already dug two tiles along, at the same level.
    map.types[2] = 'ditch';
    map.heights[2] = 0;
    map.heights[1] = 0;
    expect(finishMoat(map, 1).sort((a, b) => a - b)).toEqual([1, 2]);
    expect(map.types[1]).toBe('shallow');
    expect(map.types[2]).toBe('shallow');
    // A moat dug up on a bank above the water stays dry.
    map.heights[5 * 6 + 1] = 0;
    map.types[5 * 6] = 'shallow';
    map.heights[5 * 6] = 0;
    map.heights[4 * 6] = 1;
    expect(finishMoat(map, 4 * 6)).toEqual([4 * 6]);
    expect(map.types[4 * 6]).toBe('ditch');
  });

  it('keep ladder crews and sappers off the wall behind them, and the designer says so', () => {
    const map = flat(8);
    const plan = createPlan(map);
    for (let y = 0; y < 8; y++) expect(placePieces(map, plan, [{ kind: 'wall', x: 4, y, thickness: 'thin', height: 'low' }]).problem).toBeNull();
    const before = pieceStats(viewPlan(map, plan), plan.pieces[3] as PieceSpec);
    expect(before.ladderable).toBe(true);
    for (let y = 0; y < 8; y++) for (const x of [3, 5]) map.types[y * 8 + x] = 'ditch';
    const after = pieceStats(viewPlan(map, plan), plan.pieces[3] as PieceSpec);
    expect(after.ladderable).toBe(false);
    expect(after.notes.join(' ')).toMatch(/Moat all along its foot/);
  });

  it('old saves get an empty list of planned moats', () => {
    const s = createSim(1);
    const old = JSON.parse(JSON.stringify(s)) as Record<string, unknown>;
    delete (old.plan as Record<string, unknown>).moats;
    const loaded = fromSave(JSON.stringify({ version: 2, savedAt: 0, state: old }));
    expect(loaded.version).toBe(SAVE_VERSION);
    expect(loaded.state.plan.moats).toEqual([]);
  });
});

describe('sappers', () => {
  it('need longer for thicker walls and round towers, and the keep is never undermined', () => {
    const w = (thickness: 'thin' | 'thick'): PieceSpec => ({ kind: 'wall', x: 0, y: 0, thickness, height: 'low' });
    expect(sapSeconds(w('thick'))).toBeGreaterThan(sapSeconds(w('thin')));
    const t = (shape: 'square' | 'round'): PieceSpec => ({ kind: 'tower', x: 0, y: 0, shape, height: 'low' });
    expect(sapSeconds(t('round'))).toBeCloseTo(sapSeconds(t('square')) * 1.5);
    expect(sapSeconds({ kind: 'keep', x: 0, y: 0 })).toBe(Infinity);
  });

  it('dig under a wall the raiders can\'t climb and bring it down', () => {
    const s = field(() => ({ thickness: 'thin', height: 'high' }));
    const b = raidWith(s, 4, ['sapper']);
    fight(s);
    const sapped = Object.values(b.pieces).filter((p) => p.cause === 'sap');
    expect(sapped.length).toBeGreaterThan(0);
    const r = report(s);
    expect(r.breaches.length).toBeGreaterThan(0);
    expect(r.sections.flatMap((x) => x.lines).some((l) => l.text.startsWith('Undermined:'))).toBe(true);
  });

  it("can't dig through rock or from a moat", () => {
    for (const ground of ['rock', 'ditch'] as const) {
      const s = field(() => ({ thickness: 'thin', height: 'high' }));
      // Rock under the wall itself, or a dry moat all along its outside.
      for (let y = 0; y < SIZE; y++) s.map.types[y * SIZE + (ground === 'rock' ? 12 : 11)] = ground;
      const b = raidWith(s, 4, ['sapper']);
      seconds(s, 90);
      expect(Object.values(b.pieces).some((p) => (p.sap ?? 0) > 0), ground).toBe(false);
    }
  });
});

describe('ladder crews', () => {
  it('raise ladders against low walls, and raiders climb over without breaking anything', () => {
    const s = field(() => ({ thickness: 'thick', height: 'low' }));
    const b = raidWith(s, 4, ['ladderCrew', 'raider']);
    fight(s);
    expect(b.stats.siege?.laddersUp).toBeGreaterThan(0);
    expect(b.stats.siege?.climbed).toBeGreaterThan(0);
    const r = report(s);
    expect(r.outcome).toBe('plundered');
    expect(r.sections.flatMap((x) => x.lines).some((l) => l.text.startsWith('Ladder crews raised'))).toBe(true);
  });

  it("can't reach the top of a high wall", () => {
    const s = field(() => ({ thickness: 'thick', height: 'high' }));
    const b = raidWith(s, 4, ['ladderCrew']);
    seconds(s, 90);
    expect(b.stats.siege?.laddersUp).toBe(0);
  });

  it('have their ladders pushed away by soldiers on the wall', () => {
    const s = field(() => ({ thickness: 'thick', height: 'low' }));
    s.economy.troops = { swordsman: 0, archer: 24 };
    s.economy.troopsWanted = { swordsman: 0, archer: 24 };
    for (let y = 0; y < SIZE; y++) for (let k = 0; k < 2; k++) addPost(s.map, s.plan, s.economy, s.defence, 'archer', 12, y);
    // Archers only shoot what's in sight, so they don't simply kill the crews on the way in.
    const b = raidWith(s, 6, ['ladderCrew']);
    for (const u of b.units) if (u.type === 'archer') u.cooldown = 1e9;
    seconds(s, 120);
    expect(b.stats.siege?.laddersUp).toBeGreaterThan(0);
    expect(b.stats.siege?.laddersPushed).toBeGreaterThan(0);
  });
});

describe('sight lines', () => {
  it("archers on either side of a wall can't hit each other with the wall between them", () => {
    const s = field(() => ({ thickness: 'thick', height: 'medium' }));
    s.economy.troops = { swordsman: 0, archer: 1 };
    s.economy.troopsWanted = { swordsman: 0, archer: 1 };
    expect(addPost(s.map, s.plan, s.economy, s.defence, 'archer', 14, 4)).toBeNull();
    const b = raidWith(s, 3, ['raiderArcher']);
    seconds(s, 60);
    expect(b.units.filter((u) => u.type === 'archer')[0]?.hp).toBe(35);
    expect(b.stats.lost.raiderArcher).toBe(0);
  });

  it('archers on a tower shoot over the wall in front of it; on the ground behind it they can\'t', () => {
    const tower: PieceSpec = { kind: 'tower', x: 13, y: 4, shape: 'square', height: 'medium' };
    const kills = (post: 'tower' | 'ground') => {
      const s = field(() => ({ thickness: 'thick', height: 'medium' }), 5, [tower]);
      s.economy.troops = { swordsman: 0, archer: 2 };
      s.economy.troopsWanted = { swordsman: 0, archer: 2 };
      for (let k = 0; k < 2; k++) expect(addPost(s.map, s.plan, s.economy, s.defence, 'archer', post === 'tower' ? 13 : 14, post === 'tower' ? 4 : 5)).toBeNull();
      const b = raidWith(s, 3, ['raider']);
      seconds(s, 120);
      return b.stats.lost.raider;
    };
    expect(kills('tower')).toBeGreaterThan(0);
    expect(kills('ground')).toBe(0);
  });
});

describe('sorties', () => {
  const gate: PieceSpec = { kind: 'gatehouse', x: 12, y: 12, axis: 'x' };

  it('swordsmen go out through the gate after raider archers outside, and the gate opens for them', () => {
    const s = field(() => ({ thickness: 'thick', height: 'high' }), 5, [gate]);
    s.economy.troops = { swordsman: 4, archer: 0 };
    s.economy.troopsWanted = { swordsman: 4, archer: 0 };
    for (let k = 0; k < 4; k++) expect(addPost(s.map, s.plan, s.economy, s.defence, 'swordsman', 14, 12)).toBeNull();
    const b = raidWith(s, 3, ['raiderArcher']);
    let opened = false;
    for (let i = 0; i < 30 * 200 && s.defence.battle; i++) {
      stepSim(s);
      if ((b.pieces[s.plan.pieces.find((p) => p.kind === 'gatehouse')?.id ?? 0]?.openUntil ?? 0) > b.tick) opened = true;
    }
    expect(b.stats.siege?.sorties).toBeGreaterThan(0);
    expect(b.stats.lost.raiderArcher).toBeGreaterThan(0);
    expect(opened).toBe(true);
    expect(report(s).sections.flatMap((x) => x.lines).some((l) => l.text.includes('went out through the gate'))).toBe(true);
  });

  it("a lone swordsman doesn't go out against a crowd of raiders", () => {
    const s = field(() => ({ thickness: 'thick', height: 'high' }), 5, [gate]);
    s.economy.troops = { swordsman: 1, archer: 0 };
    s.economy.troopsWanted = { swordsman: 1, archer: 0 };
    expect(addPost(s.map, s.plan, s.economy, s.defence, 'swordsman', 14, 12)).toBeNull();
    const b = raidWith(s, 4, ['raider']);
    seconds(s, 40);
    expect(b.stats.siege?.sorties).toBe(0);
  });
});

describe('where raids come from', () => {
  it('mostly round the open side rather than through the wall, and seldom the same side twice', () => {
    const s = field(() => ({ thickness: 'thick', height: 'high' }));
    const count = (last: SimState['defence']['lastFrom']) => {
      s.defence.lastFrom = last;
      const tally: Record<string, number> = {};
      const rng = new Rng(9);
      for (let i = 0; i < 60; i++) {
        const e = chooseApproach(s, rng);
        tally[e] = (tally[e] ?? 0) + 1;
      }
      return tally;
    };
    const fresh = count(null);
    expect(fresh['south-east'] ?? 0).toBeGreaterThan(30);
    expect(fresh['north-west'] ?? 0).toBeLessThan(fresh['south-east'] ?? 0);
    // Having just come from the south-east, they come from there less often.
    const again = count('south-east');
    expect(again['south-east'] ?? 0).toBeLessThan(fresh['south-east'] ?? 0);
    expect(RAIDS.repeatPenalty).toBeGreaterThan(0);
  });

  it('the scouts report the side picked when they bring word', () => {
    const s = field(() => ({ thickness: 'thick', height: 'high' }));
    s.defence.nextRaid = 15;
    s.defence.from = 'north-west';
    for (let i = 0; i < 30 * (15 - RAIDS.warningDays); i++) stepSim(s);
    expect(s.defence.warned).toBe(true);
    const line = s.log.find((l) => l.text.startsWith('Scouts report'));
    expect(line?.text).toContain(s.defence.from);
  });
});
