import { describe, expect, it } from 'vitest';
import { COMBAT, RAIDS } from '../src/data/combat';
import { CALENDAR } from '../src/data/economy';
import type { TerrainId } from '../src/data/terrain';
import { bowReach, deploying, redeploy } from '../src/sim/battle';
import { isWinter } from '../src/sim/calendar';
import { createPlan, placePieces, toggleExtra, type PieceSpec } from '../src/sim/castle';
import { addPost, raidStrength } from '../src/sim/defence';
import { dailyWages } from '../src/sim/economy';
import { fromSave, toSave } from '../src/sim/save';
import { createSim, raidNow, stepSim, today, type SimState } from '../src/sim/state';
import type { TerrainMap } from '../src/sim/terrain';
import { pieceProgress } from '../src/sim/works';
import { build, days, fight, hilltopCastle } from './helpers';

const SIZE = 24;

/**
 * A flat field with a wall right across it at x = 12 and the keep beyond it. Raiders come from the
 * north-west edge (x = 0). No soldiers unless a test adds them.
 */
function field(wall: (y: number) => Partial<Extract<PieceSpec, { kind: 'wall' }>> = () => ({}), seed = 5): SimState {
  const s = createSim(seed);
  const map: TerrainMap = {
    width: SIZE,
    height: SIZE,
    heights: new Array<number>(SIZE * SIZE).fill(1),
    types: new Array<TerrainId>(SIZE * SIZE).fill('grass'),
  };
  s.map = map;
  s.plan = createPlan(map);
  s.camp = [20, 20];
  s.economy.troops = { swordsman: 0, archer: 0 };
  s.economy.troopsWanted = { swordsman: 0, archer: 0 };
  s.defence.from = 'north-west';
  for (let y = 0; y < SIZE; y++)
    expect(placePieces(map, s.plan, [{ kind: 'wall', x: 12, y, thickness: 'standard', height: 'medium', ...wall(y) }]).problem).toBeNull();
  expect(placePieces(map, s.plan, [{ kind: 'keep', x: 18, y: 10 }]).problem).toBeNull();
  build(s);
  return s;
}

function report(s: SimState) {
  const r = s.defence.reports[s.defence.reports.length - 1];
  if (!r) throw new Error('no report');
  return r;
}

describe('raiders on the move', () => {
  it('walk through an unfinished stretch rather than batter a finished wall', () => {
    const s = field();
    const gap = s.plan.pieces.find((p) => p.x === 12 && p.y === 17);
    build(s, 0.3, (p) => p === gap);
    raidNow(s);
    fight(s);
    const r = report(s);
    expect(r.breaches).toHaveLength(0);
    expect(r.gaps).toBeGreaterThan(0);
    expect(r.outcome).toBe('plundered');
    expect(r.sections.flatMap((x) => x.lines).some((l) => l.text.includes('unfinished'))).toBe(true);
  });

  it('pick the thin wall to batter through, and it falls', () => {
    const s = field((y) => ({ thickness: y === 4 ? 'thin' : 'thick' }));
    raidNow(s);
    fight(s);
    const r = report(s);
    expect(r.breaches.map((b) => [b.x, b.y])).toEqual([[12, 4]]);
    // The report says why, in plain words.
    expect(r.sections.flatMap((x) => x.lines).some((l) => l.text.includes('Thin walls have 100 HP'))).toBe(true);
  });

  it('take far longer to batter through a thick wall than a thin one', () => {
    const time = (thickness: 'thin' | 'thick') => {
      const s = field(() => ({ thickness }));
      raidNow(s);
      fight(s);
      return report(s).breaches[0]?.seconds ?? Infinity;
    };
    const thin = time('thin');
    const thick = time('thick');
    expect(thin).toBeLessThan(60);
    expect(thick).toBeGreaterThan(thin * 2);
  });

  it('plunder the keep if nobody stops them, and the stores pay for it', () => {
    const s = field((y) => ({ thickness: y === 4 ? 'thin' : 'thick' }));
    const crowns = s.economy.stores.crowns;
    raidNow(s);
    fight(s);
    const r = report(s);
    expect(r.outcome).toBe('plundered');
    expect(r.plunder?.crowns).toBe(Math.round(crowns * COMBAT.plunder.crowns));
    expect(s.economy.stores.crowns).toBe(crowns - (r.plunder?.crowns ?? 0));
  });

  it('go for the camp when no keep stands yet', () => {
    const s = field();
    s.plan.pieces = s.plan.pieces.filter((p) => p.kind !== 'keep');
    raidNow(s);
    expect(s.defence.battle?.target).toBe('camp');
  });
});

describe('defending', () => {
  it('height gives archers reach, and shooting up costs it', () => {
    expect(bowReach(0)).toBe(COMBAT.bowRange);
    expect(bowReach(3)).toBeGreaterThan(bowReach(1));
    expect(bowReach(-3)).toBeLessThan(COMBAT.bowRange);
  });

  it('a garrison on finished walls beats off the first raid', () => {
    const s = createSim(1991);
    hilltopCastle(s);
    build(s);
    raidNow(s);
    expect(s.defence.battle?.units.filter((u) => u.side === 'defender' && u.on).length).toBeGreaterThan(0);
    fight(s);
    const r = report(s);
    expect(r.outcome).toBe('repelled');
    expect(r.attackers.killed).toBeGreaterThan(r.defenders.lost);
  });

  it('archers on high walls lose fewer men to raider archers than on low ones', () => {
    const losses = (height: 'low' | 'high') => {
      let lost = 0;
      for (const seed of [1, 2, 3, 4]) {
        const s = createSim(seed);
        hilltopCastle(s, { height }, { height });
        build(s);
        s.economy.troops = { swordsman: 0, archer: 8 };
        s.defence.raidCount = 2;
        raidNow(s);
        fight(s);
        lost += report(s).defenders.lost;
      }
      return lost;
    };
    expect(losses('high')).toBeLessThan(losses('low'));
  });

  it('arrow slits turn aside more arrows than battlements alone', () => {
    const saved = (slits: boolean) => {
      const out = { slits: 0, battlements: 0 };
      for (const seed of [1, 2, 3]) {
        const s = createSim(seed);
        hilltopCastle(s, { height: 'low' }, { height: 'low' });
        if (slits) for (const p of s.plan.pieces) if (p.kind !== 'keep') p.slits = true;
        build(s);
        s.economy.troops = { swordsman: 0, archer: 8 };
        s.defence.raidCount = 3;
        raidNow(s);
        const b = s.defence.battle;
        fight(s);
        out.slits += b?.stats.saved.slits ?? 0;
        out.battlements += b?.stats.saved.battlements ?? 0;
      }
      return out;
    };
    const withSlits = saved(true);
    const without = saved(false);
    expect(without.slits).toBe(0);
    expect(withSlits.slits).toBeGreaterThan(without.battlements);
  });

  it('an oil cauldron pours on raiders at the foot of its wall, a limited number of times, if an archer mans it', () => {
    const s = field((y) => ({ thickness: y === 4 ? 'thin' : 'thick' }));
    toggleExtra(s.plan, 12, 4, 'cauldron');
    build(s);
    s.economy.troops = { swordsman: 0, archer: 1 };
    expect(addPost(s.map, s.plan, s.economy, s.defence, 'archer', 12, 4)).toBeNull();
    raidNow(s);
    const b = s.defence.battle;
    fight(s);
    const piece = s.plan.pieces.find((p) => p.x === 12 && p.y === 4) as { id: number };
    expect(b?.stats.oilUses[piece.id]).toBeGreaterThan(0);
    expect(b?.stats.oilUses[piece.id]).toBeLessThanOrEqual(COMBAT.cauldron.uses);
    expect(b?.stats.oilKills[piece.id] ?? 0).toBeGreaterThan(0);

    // Unmanned, it does nothing.
    const t = field((y) => ({ thickness: y === 4 ? 'thin' : 'thick' }));
    toggleExtra(t.plan, 12, 4, 'cauldron');
    build(t);
    raidNow(t);
    const c = t.defence.battle;
    fight(t);
    expect(c?.stats.oilUses[piece.id] ?? 0).toBe(0);
  });

  it('posts: archers on pieces, swordsmen on the ground, up to the room there and the soldiers you have', () => {
    const s = field();
    s.economy.troops = { swordsman: 1, archer: 3 };
    s.economy.troopsWanted = { swordsman: 1, archer: 3 };
    const { map, plan, economy: e, defence: d } = s;
    expect(addPost(map, plan, e, d, 'swordsman', 12, 3)).toMatch(/ground/);
    expect(addPost(map, plan, e, d, 'archer', 12, 3)).toBeNull();
    expect(addPost(map, plan, e, d, 'archer', 12, 3)).toBeNull();
    expect(addPost(map, plan, e, d, 'archer', 12, 3)).toMatch(/Full/);
    expect(addPost(map, plan, e, d, 'archer', 5, 5)).toBeNull();
    expect(addPost(map, plan, e, d, 'archer', 6, 5)).toMatch(/have posts/);
    expect(addPost(map, plan, e, d, 'swordsman', 6, 5)).toBeNull();
  });

  it('troops can be posted after the raiders arrive, until the fighting starts', () => {
    const s = field();
    s.economy.troops = { swordsman: 0, archer: 1 };
    s.economy.troopsWanted = { swordsman: 0, archer: 1 };
    raidNow(s);
    const b = s.defence.battle;
    if (!b) throw new Error('no battle');
    expect(deploying(b)).toBe(true);
    const raiders = b.units.filter((u) => u.side !== 'defender').map((u) => [u.id, u.x, u.y]);
    expect(addPost(s.map, s.plan, s.economy, s.defence, 'archer', 12, 20)).toBeNull();
    expect(redeploy(s)).toBe(true);
    const archers = b.units.filter((u) => u.type === 'archer');
    expect(archers).toHaveLength(1);
    expect([Math.round(archers[0]?.x ?? 0), Math.round(archers[0]?.y ?? 0)]).toEqual([12, 20]);
    expect(b.stats.start.archer).toBe(1);
    // The raiders haven't moved.
    expect(b.units.filter((u) => u.side !== 'defender').map((u) => [u.id, u.x, u.y])).toEqual(raiders);
    // Once the fight starts, posts no longer move anyone.
    stepSim(s);
    expect(deploying(b)).toBe(false);
    s.defence.posts = [];
    expect(redeploy(s)).toBe(false);
  });
});

describe('after the battle', () => {
  it('breached pieces go back to footings, damage undoes work, and the fallen leave the garrison', () => {
    const s = field((y) => ({ thickness: y === 4 ? 'thin' : 'thick' }));
    s.economy.troops = { swordsman: 2, archer: 0 };
    s.economy.troopsWanted = { swordsman: 2, archer: 0 };
    raidNow(s);
    fight(s);
    const r = report(s);
    const breached = s.plan.pieces.find((p) => p.x === 12 && p.y === 4);
    expect(breached && pieceProgress(s.map, s.works, breached)).toBeCloseTo(COMBAT.breachedProgress);
    expect(s.works.pieces[breached?.id ?? 0]?.complete).toBe(false);
    expect(r.repairs).toBeGreaterThan(0);
    expect(s.economy.troops.swordsman).toBe(2 - r.defenders.lost);
    expect(s.defence.battle).toBeNull();
    expect(s.log.some((l) => l.text === r.headline)).toBe(true);
  });

  it('the next raid is booked, outside winter, and comes stronger', () => {
    const s = field();
    raidNow(s);
    fight(s);
    expect(s.defence.nextRaid).toBeGreaterThan(today(s) + RAIDS.gap[0] - 1);
    expect(isWinter(s.defence.nextRaid)).toBe(false);
    expect(raidStrength(2).raider).toBeGreaterThan(raidStrength(1).raider);
  });
});

describe('raids in the calendar', () => {
  it('scouts warn ahead, the raid comes on the day, and the calendar waits for the battle', () => {
    const s = field();
    s.defence.nextRaid = 20;
    days(s, 20 - RAIDS.warningDays);
    expect(s.defence.warned).toBe(true);
    expect(s.log.some((l) => l.text.startsWith('Scouts report raiders'))).toBe(true);
    days(s, RAIDS.warningDays);
    expect(s.defence.battle).not.toBeNull();
    const tick = s.tick;
    for (let i = 0; i < 5 * CALENDAR.ticksPerDay; i++) stepSim(s);
    expect(s.tick).toBe(tick);
    fight(s);
    stepSim(s);
    expect(s.tick).toBe(tick + 1);
  });

  it('no raids come when raids are off', () => {
    const s = field();
    s.defence.raids = false;
    s.defence.nextRaid = 5;
    days(s, 20);
    expect(s.defence.battle).toBeNull();
    expect(s.defence.raidCount).toBe(0);
  });
});

describe('the garrison', () => {
  it('the crown pays for the starting garrison; extra soldiers cost wages', () => {
    const s = createSim(1);
    const base = dailyWages(s.economy, false);
    expect(base).toBe(0);
    s.economy.troops.archer += 2;
    expect(dailyWages(s.economy, false)).toBeGreaterThan(base);
  });
});

describe('determinism', () => {
  it('the same seed fights the same battle, and a battle saved halfway carries on exactly', () => {
    const run = () => {
      const s = createSim(77);
      hilltopCastle(s, { thickness: 'thin' });
      build(s);
      s.defence.raidCount = 3;
      raidNow(s);
      return s;
    };
    const a = run();
    const b = run();
    for (let i = 0; i < 30 * 30; i++) {
      stepSim(a);
      stepSim(b);
    }
    const c = fromSave(toSave(a, 0)).state;
    expect(c).toEqual(a);
    fight(a);
    fight(b);
    fight(c);
    expect(report(b)).toEqual(report(a));
    expect(report(c)).toEqual(report(a));
  });
});
