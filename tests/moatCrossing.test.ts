import { describe, expect, it } from 'vitest';
import { SIEGE, type RaiderType } from '../src/data/combat';
import type { TerrainId } from '../src/data/terrain';
import { isCauseway } from '../src/sim/battle';
import { createPlan, placePieces } from '../src/sim/castle';
import { raidStrength } from '../src/sim/defence';
import { fromSave, SAVE_VERSION, toSave } from '../src/sim/save';
import { createSim, raidNow, stepSim, type SimState } from '../src/sim/state';
import type { TerrainMap } from '../src/sim/terrain';
import { build, fight } from './helpers';

const SIZE = 24;

/**
 * A flat field with a wall right across it at x = 12, the keep beyond, and a moat (`moat`: a dry
 * ditch, shallow water, or none) along the outside of the wall at x = 11. Raiders come from x = 0.
 */
function moated(moat: TerrainId | null, seed = 5): SimState {
  const s = createSim(seed);
  const map: TerrainMap = { width: SIZE, height: SIZE, heights: new Array<number>(SIZE * SIZE).fill(1), types: new Array<TerrainId>(SIZE * SIZE).fill('grass') };
  s.map = map;
  s.plan = createPlan(map);
  s.camp = [20, 20];
  s.economy.troops = { swordsman: 0, archer: 0 };
  s.economy.troopsWanted = { swordsman: 0, archer: 0 };
  s.defence.from = 'north-west';
  for (let y = 0; y < SIZE; y++) expect(placePieces(map, s.plan, [{ kind: 'wall', x: 12, y, thickness: 'thin', height: 'low' }]).problem).toBeNull();
  expect(placePieces(map, s.plan, [{ kind: 'keep', x: 18, y: 10 }]).problem).toBeNull();
  build(s);
  if (moat) for (let y = 0; y < SIZE; y++) map.types[y * SIZE + 11] = moat;
  return s;
}

function raidWith(s: SimState, n: number, keep: readonly RaiderType[]) {
  s.defence.raidCount = n - 1;
  raidNow(s);
  const b = s.defence.battle;
  if (!b) throw new Error('no battle');
  b.units = b.units.filter((u) => u.side === 'defender' || keep.includes(u.type as RaiderType));
  for (const t of ['raider', 'raiderArcher', 'sapper', 'ladderCrew', 'filler'] as const) b.stats.start[t] = keep.includes(t) ? b.stats.start[t] : 0;
  b.version++;
  return b;
}

describe('crossing a moat', () => {
  it('hurts raiders who wade it, a wet moat more than a dry one, and the report says so', () => {
    const hurt = (moat: TerrainId) => {
      let n = 0;
      for (const seed of [1, 2, 3]) {
        const s = moated(moat, seed);
        const b = raidWith(s, 8, ['raider']);
        // A breach to aim for, so they have to cross.
        const gap = Object.values(b.pieces).find((p) => p.x === 12 && p.y === 12);
        if (gap) {
          gap.standing = false;
          gap.hp = 0;
        }
        b.version++;
        fight(s);
        n += b.stats.siege?.moatHurt ?? 0;
      }
      return n;
    };
    const wet = hurt('shallow');
    const dry = hurt('ditch');
    expect(dry).toBeGreaterThan(0);
    expect(wet).toBeGreaterThan(dry);
  });

  it('a moat costs nothing on open ground away from the castle', () => {
    const s = moated(null);
    // A ditch well out in the field, more than two tiles from any piece.
    for (let y = 0; y < SIZE; y++) s.map.types[y * SIZE + 5] = 'ditch';
    const b = raidWith(s, 8, ['raider']);
    for (let i = 0; i < 30 * 40; i++) stepSim(s);
    expect(b.stats.siege?.moatHurt ?? 0).toBe(0);
  });
});

describe('bundle carriers', () => {
  it('come from the third raid', () => {
    expect(raidStrength(2).filler).toBe(0);
    expect(raidStrength(3).filler).toBeGreaterThan(0);
  });

  it('all make for one tile and fill it into a causeway, then fight on', () => {
    const s = moated('ditch');
    const b = raidWith(s, 5, ['filler']);
    const carriers = b.units.filter((u) => u.type === 'filler');
    expect(carriers.length).toBeGreaterThanOrEqual(SIEGE.moat.fill.bundles);
    for (let i = 0; i < 30 * 120 && (b.stats.siege?.causeways ?? 0) === 0; i++) stepSim(s);
    expect(b.stats.siege?.causeways ?? 0).toBeGreaterThan(0);
    const filled = Object.keys(b.fill ?? {}).map(Number).filter((i) => isCauseway(b, i));
    expect(filled.length).toBeGreaterThan(0);
    // In the moat at the foot of the wall.
    for (const i of filled) expect(i % SIZE).toBe(11);
    // Their bundles thrown, they fight on like raiders.
    for (let i = 0; i < 30 * 15; i++) stepSim(s);
    expect(carriers.filter((u) => u.hp > 0).every((u) => !u.bundle)).toBe(true);
    fight(s);
    const r = s.defence.reports[s.defence.reports.length - 1];
    expect(r?.sections.flatMap((x) => x.lines).some((l) => /causeway/.test(l.text))).toBe(true);
  });

  it('with no moat to fill, fight like raiders', () => {
    const s = moated(null);
    const b = raidWith(s, 5, ['filler']);
    for (let i = 0; i < 30 * 60; i++) stepSim(s);
    expect(b.fill ?? {}).toEqual({});
    expect(b.units.some((u) => u.type === 'filler' && u.act === 'batter')).toBe(true);
  });

  it('a battle saved mid-fight from before them loads with none', () => {
    const s = moated('ditch');
    raidWith(s, 5, ['raider']);
    const text = toSave(s, 0);
    const old = JSON.parse(text) as { version: number; state: { defence: { battle: { stats: { start: Record<string, number>; lost: Record<string, number> } } } } };
    old.version = 4;
    delete old.state.defence.battle.stats.start.filler;
    delete old.state.defence.battle.stats.lost.filler;
    const back = fromSave(JSON.stringify(old));
    expect(back.version).toBe(SAVE_VERSION);
    expect(back.state.defence.battle?.stats.start.filler).toBe(0);
  });
});
