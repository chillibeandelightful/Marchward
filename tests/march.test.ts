import { describe, expect, it } from 'vitest';
import { RAIDS } from '../src/data/combat';
import type { TerrainId } from '../src/data/terrain';
import { marchSlots } from '../src/sim/battle';
import { createPlan, placePieces } from '../src/sim/castle';
import { Rng } from '../src/sim/rng';
import { createSim, raidNow, stepSim, type SimState } from '../src/sim/state';
import type { TerrainMap } from '../src/sim/terrain';
import { build } from './helpers';

const W = 44;
const H = 30;

/** A wide flat field with the keep far over on the east, raiders coming in from the west edge (x = 0). */
function openField(seed: number): SimState {
  const s = createSim(seed);
  const map: TerrainMap = { width: W, height: H, heights: new Array<number>(W * H).fill(1), types: new Array<TerrainId>(W * H).fill('grass') };
  s.map = map;
  s.plan = createPlan(map);
  s.camp = [40, 26];
  s.economy.troops = { swordsman: 0, archer: 0 };
  s.economy.troopsWanted = { swordsman: 0, archer: 0 };
  s.defence.from = 'north-west';
  s.defence.lastFrom = 'south-east';
  expect(placePieces(map, s.plan, [{ kind: 'keep', x: 38, y: 14 }]).problem).toBeNull();
  build(s);
  s.defence.raidCount = 5;
  raidNow(s);
  return s;
}

const raiders = (s: SimState) => (s.defence.battle?.units ?? []).filter((u) => u.side === 'attacker' && u.hp > 0);

describe('the march in', () => {
  it('lays out rows of varying size, every marcher placed once', () => {
    const rng = new Rng(7);
    const slots = marchSlots(rng, 23);
    expect(slots).toHaveLength(23);
    const rows = new Map<number, number>();
    for (const sl of slots) {
      const row = Math.round(sl.back / RAIDS.march.rowGap);
      rows.set(row, (rows.get(row) ?? 0) + 1);
    }
    const sizes = [...rows.entries()].sort((a, b) => a[0] - b[0]).map(([, n]) => n);
    expect(sizes.length).toBeGreaterThan(2);
    // Every row but the last is within the limits, and no two rows in a row are the same size.
    for (const n of sizes.slice(0, -1)) {
      expect(n).toBeGreaterThanOrEqual(RAIDS.march.rowMin);
      expect(n).toBeLessThanOrEqual(RAIDS.march.rowMax);
    }
    for (let i = 1; i < sizes.length - 1; i++) expect(sizes[i]).not.toBe(sizes[i - 1]);
  });

  it('raiders come on side by side in rows, not in single file, then break ranks near the castle', () => {
    const s = openField(3);
    const b = s.defence.battle;
    expect(b?.march).toBeDefined();
    const spread = () => {
      const ys = raiders(s).map((u) => u.y);
      return Math.max(...ys) - Math.min(...ys);
    };
    expect(spread()).toBeGreaterThan(2);
    // Twelve seconds in, still marching as a broad front across the field.
    for (let i = 0; i < 30 * 12; i++) stepSim(s);
    expect(s.defence.battle?.march?.done).toBe(false);
    expect(spread()).toBeGreaterThan(2);
    const xs = raiders(s).map((u) => u.x);
    expect(Math.max(...xs) - Math.min(...xs)).toBeLessThan(8); // a block, not a long column
    expect(Math.min(...xs)).toBeGreaterThan(2); // and well on their way
    for (let i = 0; i < 30 * 90 && s.defence.battle && !s.defence.battle.march?.done; i++) stepSim(s);
    expect(s.defence.battle?.march?.done ?? true).toBe(true);
  });

  it('is the same every time for the same seed', () => {
    const a = openField(11);
    const b = openField(11);
    for (let i = 0; i < 30 * 8; i++) {
      stepSim(a);
      stepSim(b);
    }
    expect(raiders(a).map((u) => [u.x, u.y])).toEqual(raiders(b).map((u) => [u.x, u.y]));
  });
});
