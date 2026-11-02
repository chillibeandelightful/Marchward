import { describe, expect, it } from 'vitest';
import { GATEHOUSE } from '../src/data/castle';
import { COMBAT, SIEGE, type RaiderType } from '../src/data/combat';
import type { TerrainId } from '../src/data/terrain';
import { orderUnits } from '../src/sim/battle';
import { checkPlacement, createPlan, footprint, pieceCost, pieceHp, pieceName, pieceStats, placePieces, planReport, viewPlan, type PieceSpec } from '../src/sim/castle';
import { addPost } from '../src/sim/defence';
import { Rng } from '../src/sim/rng';
import { fromSave, toSave } from '../src/sim/save';
import { beginSiege, bribeCost, buyOffSiege, isSiegeRaid, siegeSupplies } from '../src/sim/siege';
import { buySupplies, createSim, raidNow, stepSim, today, type SimState } from '../src/sim/state';
import type { TerrainMap } from '../src/sim/terrain';
import { build, days, fight, hilltopCastle } from './helpers';

const SIZE = 24;

function flat(size = SIZE, type: TerrainId = 'grass'): TerrainMap {
  return { width: size, height: size, heights: new Array<number>(size * size).fill(1), types: new Array<TerrainId>(size * size).fill(type) };
}

const GATE: PieceSpec = { kind: 'gatehouse', x: 12, y: 12, axis: 'x', wide: true };

/** A flat field with a wall right across it at x = 12, the keep beyond, and whatever else is given. Raiders come from x = 0. */
function field(extra: PieceSpec[] = [], seed = 5): SimState {
  const s = createSim(seed);
  const map = flat();
  s.map = map;
  s.plan = createPlan(map);
  s.camp = [20, 20];
  s.economy.troops = { swordsman: 0, archer: 0 };
  s.economy.troopsWanted = { swordsman: 0, archer: 0 };
  s.defence.from = 'north-west';
  for (let y = 0; y < SIZE; y++) expect(placePieces(map, s.plan, [{ kind: 'wall', x: 12, y, thickness: 'thick', height: 'high' }]).problem).toBeNull();
  expect(placePieces(map, s.plan, [{ kind: 'keep', x: 18, y: 10 }]).problem).toBeNull();
  for (const e of extra) expect(placePieces(map, s.plan, [e]).problem).toBeNull();
  build(s);
  return s;
}

/** Start raid `n`, keeping only the kinds of raider given. */
function raidWith(s: SimState, n: number, keep: readonly RaiderType[]) {
  s.defence.raidCount = n - 1;
  raidNow(s);
  const b = s.defence.battle;
  if (!b) throw new Error('no battle');
  b.units = b.units.filter((u) => u.side === 'defender' || keep.includes(u.type as RaiderType));
  for (const t of ['raider', 'raiderArcher', 'sapper', 'ladderCrew'] as const) b.stats.start[t] = keep.includes(t) ? b.stats.start[t] : 0;
  b.version++;
  return b;
}

/** Make every piece but the gatehouse too strong to batter, so the raiders go for the gate. */
function onlyTheGate(s: SimState): void {
  const b = s.defence.battle;
  if (!b) throw new Error('no battle');
  for (const p of Object.values(b.pieces))
    if (p.kind !== 'gatehouse') {
      p.hp = 1e6;
      p.max = 1e6;
    }
  b.version++;
}

function lastReport(s: SimState) {
  const r = s.defence.reports[s.defence.reports.length - 1];
  if (!r) throw new Error('no report');
  return r;
}

describe('wide gatehouses', () => {
  it('stand three tiles across the passage, replacing the wall there, and are stronger and dearer than a narrow gate', () => {
    const s = field([GATE]);
    const gate = s.plan.pieces.find((p) => p.kind === 'gatehouse');
    expect(gate).toBeDefined();
    expect(footprint(gate as PieceSpec)).toEqual([
      [12, 11],
      [12, 12],
      [12, 13],
    ]);
    // The three walls under it went; the curtain still runs unbroken.
    expect(s.plan.pieces.filter((p) => p.kind === 'wall')).toHaveLength(SIZE - 3);
    const narrow: PieceSpec = { kind: 'gatehouse', x: 12, y: 12, axis: 'x' };
    expect(pieceHp(GATE)).toBe(GATEHOUSE.hp);
    expect(pieceHp(narrow)).toBe(GATEHOUSE.narrow.hp);
    expect(pieceHp(GATE)).toBeGreaterThan(pieceHp(narrow));
    expect(pieceCost(s.map, GATE).stone).toBeGreaterThan(pieceCost(s.map, narrow).stone);
    expect(pieceName(GATE)).toBe('Gatehouse');
    expect(pieceName(narrow)).toBe('Narrow gatehouse');
  });

  it("can't stand across a cliff, and nothing may block the passage", () => {
    const map = flat(10);
    map.heights[3 * 10 + 5] = 4; // a cliff where one flanking tower would stand
    const plan = createPlan(map);
    expect(checkPlacement(map, plan, [{ kind: 'gatehouse', x: 5, y: 4, axis: 'x', wide: true }]).problem).toMatch(/cliff/);
    expect(checkPlacement(map, plan, [{ kind: 'gatehouse', x: 5, y: 7, axis: 'x', wide: true }]).problem).toBeNull();
    placePieces(map, plan, [{ kind: 'gatehouse', x: 5, y: 7, axis: 'x', wide: true }]);
    expect(checkPlacement(map, plan, [{ kind: 'wall', x: 6, y: 7, thickness: 'thin', height: 'low' }]).problem).toMatch(/block the gate/);
    // The flanking towers are solid: nothing else can go there.
    expect(checkPlacement(map, plan, [{ kind: 'tower', x: 5, y: 8, shape: 'square', height: 'low' }]).problem).toMatch(/already built/);
  });

  it('a castle can have two gates, and the Kestrel Ford castle is still ready with them', () => {
    const s = field([GATE, { kind: 'gatehouse', x: 12, y: 4, axis: 'x', wide: true }]);
    const r = planReport(s.map, viewPlan(s.map, s.plan));
    expect(r.gatehouses).toBe(2);
    expect(r.problems).toEqual([]);
    const k = createSim(1);
    hilltopCastle(k);
    // A second, wide gate in the far wall.
    expect(placePieces(k.map, k.plan, [{ kind: 'gatehouse', x: 36, y: 41, axis: 'y', wide: true }]).problem).toBeNull();
    const rk = planReport(k.map, viewPlan(k.map, k.plan));
    expect(rk.gatehouses).toBe(2);
    expect(rk.ready).toBe(true);
  });

  it('raiders make for the gate itself, not the stone beside it, and your soldiers go out only by the passage', () => {
    const s = field([GATE]);
    s.economy.troops = { swordsman: 3, archer: 0 };
    s.economy.troopsWanted = { swordsman: 3, archer: 0 };
    for (let k = 0; k < 3; k++) expect(addPost(s.map, s.plan, s.economy, s.defence, 'swordsman', 14, 12)).toBeNull();
    const b = raidWith(s, 3, ['raider', 'raiderArcher']);
    onlyTheGate(s);
    const gate = Object.values(b.pieces).find((p) => p.kind === 'gatehouse');
    if (!gate) throw new Error('no gate');
    const fronts = new Set<number>();
    const outFrom = new Set<string>();
    for (let i = 0; i < 30 * 120 && s.defence.battle && gate.standing; i++) {
      stepSim(s);
      if (b.front >= 0) fronts.add(b.front);
      for (const u of b.units) {
        const tx = Math.round(u.x);
        const ty = Math.round(u.y);
        // Defenders seen on the wall line are passing through: only ever in the passage.
        if (u.side === 'defender' && tx === 12 && u.hp > 0) outFrom.add(`${tx},${ty}`);
      }
    }
    // They gather in front of the gate, beyond the passage.
    expect([...fronts]).toEqual([12 * SIZE + 11]);
    expect(gate.hp).toBeLessThan(gate.max);
    for (const t of outFrom) expect(t).toBe('12,12');
  });
});

describe('drawbridges', () => {
  /** The wide gate with a dry moat dug across the outside end of its passage. */
  function moated(): SimState {
    const s = field([GATE]);
    const i = 12 * SIZE + 11;
    s.map.types[i] = 'ditch';
    s.map.heights[i] = 0;
    return s;
  }

  it('a finished gatehouse with a moat across its passage has a drawbridge, which the designer mentions', () => {
    const s = moated();
    const gate = s.plan.pieces.find((p) => p.kind === 'gatehouse') as PieceSpec;
    expect(pieceStats(viewPlan(s.map, s.plan), gate).notes.some((n) => /Drawbridge/.test(n))).toBe(true);
    raidNow(s);
    const pc = Object.values(s.defence.battle?.pieces ?? {}).find((p) => p.kind === 'gatehouse');
    expect(pc?.bridge).toBe(SIEGE.drawbridge.hp);
    expect(pc?.bridgeTiles).toEqual([12 * SIZE + 11]);
  });

  it('raiders have to batter the raised drawbridge down from the moat before the gate', () => {
    // A narrow gate between walls, so the only way at it is across the moat.
    const s = field([{ kind: 'gatehouse', x: 12, y: 12, axis: 'x' }]);
    s.map.types[12 * SIZE + 11] = 'ditch';
    s.map.heights[12 * SIZE + 11] = 0;
    const b = raidWith(s, 3, ['raider']);
    onlyTheGate(s);
    const gate = Object.values(b.pieces).find((p) => p.kind === 'gatehouse');
    if (!gate) throw new Error('no gate');
    let gateHitWithBridgeUp = false;
    for (let i = 0; i < 30 * 200 && s.defence.battle && gate.standing; i++) {
      stepSim(s);
      if ((gate.bridge ?? 0) > 0 && gate.hp < gate.max) gateHitWithBridgeUp = true;
    }
    expect(gateHitWithBridgeUp).toBe(false);
    expect(gate.bridge).toBe(0);
    expect(gate.hp).toBeLessThan(gate.max);
    expect(b.stats.siege?.bridgesBroken).toBe(1);
  });

  it('your swordsmen cross the moat on it when they go out', () => {
    const s = moated();
    s.economy.troops = { swordsman: 4, archer: 0 };
    s.economy.troopsWanted = { swordsman: 4, archer: 0 };
    for (let k = 0; k < 4; k++) expect(addPost(s.map, s.plan, s.economy, s.defence, 'swordsman', 14, 12)).toBeNull();
    const b = raidWith(s, 3, ['raiderArcher']);
    let crossed = false;
    for (let i = 0; i < 30 * 200 && s.defence.battle; i++) {
      stepSim(s);
      if (b.units.some((u) => u.side === 'defender' && Math.round(u.x) === 11 && Math.round(u.y) === 12)) crossed = true;
    }
    expect(crossed).toBe(true);
    expect(b.stats.siege?.sorties).toBeGreaterThan(0);
  });
});

describe('sieges', () => {
  it('every other raid from the third brings a siege train', () => {
    expect([1, 2, 3, 4, 5, 6, 7].map(isSiegeRaid)).toEqual([false, false, true, false, true, false, true]);
    expect(siegeSupplies(5)).toBeGreaterThan(siegeSupplies(3));
  });

  it('a siege raid whose assault fails camps outside instead of going home', () => {
    const s = field();
    const b = raidWith(s, 3, ['raider']);
    // Run the clock out on the assault.
    b.tick = COMBAT.maxSeconds * 30 - 1;
    fight(s);
    expect(s.defence.battle).toBeNull();
    const siege = s.defence.siege;
    expect(siege).toBeTruthy();
    expect(siege?.raiders).toBeGreaterThanOrEqual(SIEGE.blockade.minRaiders);
    expect(lastReport(s).headline).toMatch(/starve you out/);
    // Out of bowshot of the castle.
    const cx = (siege?.camp ?? 0) % SIZE;
    expect(12 - cx).toBeGreaterThanOrEqual(SIEGE.blockade.campDistance - 1);
  });

  it("an ordinary raid that gives up just goes home", () => {
    const s = field();
    const b = raidWith(s, 2, ['raider']);
    b.tick = COMBAT.maxSeconds * 30 - 1;
    fight(s);
    expect(s.defence.siege ?? null).toBeNull();
  });

  /** A siege begun directly, with this much food in the stores. */
  function besieged(food: number, raiders = 10): SimState {
    const s = field();
    s.economy.workers = { ...s.economy.workers, labourer: 20 };
    s.economy.wanted = { ...s.economy.wanted, labourer: 40 };
    s.economy.troops = { swordsman: 0, archer: 4 };
    s.economy.troopsWanted = { swordsman: 0, archer: 4 };
    s.economy.stores.food = food;
    s.economy.stores.crowns = 5000;
    expect(beginSiege(s, 3, 'north-west', raiders, today(s))).toBeTruthy();
    return s;
  }

  it('nothing can be bought and nobody new arrives while it lasts', () => {
    const s = besieged(5000);
    expect(buySupplies(s, 'food')).toMatch(/besieged/);
    const before = s.economy.workers.labourer;
    days(s, 5);
    expect(s.economy.workers.labourer).toBeLessThanOrEqual(before);
    expect(s.defence.siege).toBeTruthy();
  });

  it('with food enough, you outlast them: they run out, lose heart and go, and the next raid is scheduled', () => {
    const s = besieged(20000);
    const standing = s.economy.standing;
    const start = today(s);
    days(s, siegeSupplies(3) + 20);
    expect(s.defence.siege ?? null).toBeNull();
    const r = lastReport(s);
    expect(r.outcome).toBe('repelled');
    expect(r.headline).toMatch(/lifted/);
    expect(s.economy.standing).toBeGreaterThan(standing - 1);
    expect(s.defence.nextRaid).toBeGreaterThan(today(s));
    expect(today(s) - start).toBeGreaterThanOrEqual(siegeSupplies(3) - 5);
    expect(buySupplies(s, 'food')).toBeNull();
  });

  it('with empty stores the castle has to yield, and hands over crowns', () => {
    const s = besieged(0);
    const crowns = s.economy.stores.crowns;
    days(s, SIEGE.blockade.starveDays + 1);
    expect(s.defence.siege ?? null).toBeNull();
    const r = lastReport(s);
    expect(r.outcome).toBe('plundered');
    expect(r.plunder?.crowns).toBeGreaterThan(0);
    expect(s.economy.stores.crowns).toBeLessThan(crowns);
  });

  it('you can pay them to go', () => {
    const s = besieged(5000);
    const siege = s.defence.siege;
    if (!siege) throw new Error('no siege');
    const cost = bribeCost(siege);
    const crowns = s.economy.stores.crowns;
    const r = buyOffSiege(s, new Rng(1), today(s));
    expect(r.problem).toBeNull();
    expect(s.defence.siege ?? null).toBeNull();
    expect(s.economy.stores.crowns).toBe(crowns - cost);
    expect(lastReport(s).headline).toMatch(/paid/);
  });

  it('a siege is kept in saves', () => {
    const s = besieged(5000);
    days(s, 3);
    const back = fromSave(toSave(s, 0)).state;
    expect(back.defence.siege).toEqual(s.defence.siege);
  });
});

describe('Commander mode', () => {
  it('a swordsman sent to a tile walks there and holds it', () => {
    const s = field([GATE]);
    s.economy.troops = { swordsman: 1, archer: 0 };
    s.economy.troopsWanted = { swordsman: 1, archer: 0 };
    expect(addPost(s.map, s.plan, s.economy, s.defence, 'swordsman', 16, 4)).toBeNull();
    const b = raidWith(s, 1, ['raider']);
    stepSim(s);
    const u = b.units.find((x) => x.side === 'defender');
    if (!u) throw new Error('no swordsman');
    expect(orderUnits(s, [u.id], { kind: 'move', tile: 18 * SIZE + 15 })).toBe(1);
    for (let i = 0; i < 30 * 40; i++) stepSim(s);
    expect(Math.round(u.x)).toBe(15);
    expect(Math.round(u.y)).toBe(18);
    expect(u.order ?? null).toBeNull();
    expect(u.post).toBe(18 * SIZE + 15);
  });

  it("archers can be sent up onto a wall; swordsmen can't", () => {
    const s = field([GATE]);
    s.economy.troops = { swordsman: 1, archer: 1 };
    s.economy.troopsWanted = { swordsman: 1, archer: 1 };
    expect(addPost(s.map, s.plan, s.economy, s.defence, 'swordsman', 15, 4)).toBeNull();
    expect(addPost(s.map, s.plan, s.economy, s.defence, 'archer', 15, 5)).toBeNull();
    const b = raidWith(s, 1, ['raider']);
    stepSim(s);
    const sword = b.units.find((x) => x.type === 'swordsman');
    const archer = b.units.find((x) => x.type === 'archer');
    if (!sword || !archer) throw new Error('missing');
    const wallTile = 8 * SIZE + 12;
    expect(orderUnits(s, [sword.id], { kind: 'move', tile: wallTile })).toBe(0);
    expect(orderUnits(s, [archer.id], { kind: 'move', tile: wallTile })).toBe(1);
    for (let i = 0; i < 30 * 30 && !archer.on; i++) stepSim(s);
    const wall = s.plan.pieces.find((p) => p.kind === 'wall' && p.x === 12 && p.y === 8);
    expect(archer.on).toBe(wall?.id);
  });

  it('an archer told to attack one raider shoots at that one, not the nearest', () => {
    const s = field([GATE]);
    s.economy.troops = { swordsman: 0, archer: 1 };
    s.economy.troopsWanted = { swordsman: 0, archer: 1 };
    expect(addPost(s.map, s.plan, s.economy, s.defence, 'archer', 12, 6)).toBeNull();
    const b = raidWith(s, 3, ['raider']);
    stepSim(s);
    const archer = b.units.find((x) => x.type === 'archer');
    const raiders = b.units.filter((x) => x.side === 'attacker');
    if (!archer || raiders.length < 2) throw new Error('missing');
    // Two raiders in reach: one near, one further off.
    const [near, far] = raiders as [(typeof raiders)[number], (typeof raiders)[number]];
    b.units = b.units.filter((x) => x === archer || x === near || x === far);
    near.x = 10;
    near.y = 6;
    far.x = 9;
    far.y = 9;
    near.hp = far.hp = 1e6;
    b.version++;
    expect(orderUnits(s, [archer.id], { kind: 'attack', target: far.id })).toBe(1);
    const targets = new Set<number>();
    for (let i = 0; i < 30 * 6; i++) {
      near.x = 10;
      near.y = 6;
      far.x = 9;
      far.y = 9;
      stepSim(s);
      for (const a of b.arrows) if (a.shooter === archer.id) targets.add(a.target);
    }
    expect([...targets]).toEqual([far.id]);
  });
});
