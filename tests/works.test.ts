import { describe, expect, it } from 'vitest';
import { EARTHWORKS } from '../src/data/castle';
import { CALENDAR, ECONOMY, WORKER_TYPES, WORKERS, type WorkerType } from '../src/data/economy';
import { addWorkingDays, dateOf, isWinter } from '../src/sim/calendar';
import { createPlan, pieceCost, placePieces, type PieceSpec } from '../src/sim/castle';
import { buy, efficiency, setWanted, taxDue } from '../src/sim/economy';
import { createSim, stepSim, today, type SimState } from '../src/sim/state';
import type { TerrainMap } from '../src/sim/terrain';
import { summariseWorks } from '../src/sim/works';

function flatMap(size: number, h = 2): TerrainMap {
  return { width: size, height: size, heights: new Array<number>(size * size).fill(h), types: new Array(size * size).fill('grass') };
}

/** A fresh game on flat land, with lots of everything unless told otherwise. */
function simOn(map: TerrainMap = flatMap(12), seed = 7): SimState {
  const s = createSim(seed);
  s.map = map;
  s.plan = createPlan(map);
  s.camp = [0, 0];
  Object.assign(s.economy.stores, { crowns: 100000, stone: 5000, timber: 5000, food: 50000 });
  return s;
}

/** Put workers straight on site (skipping the wait for hiring). */
function staff(s: SimState, crew: Partial<Record<WorkerType, number>>): void {
  for (const t of WORKER_TYPES) {
    s.economy.wanted[t] = crew[t] ?? 0;
    s.economy.workers[t] = crew[t] ?? 0;
  }
}

function days(s: SimState, n: number): void {
  for (let i = 0; i < n * CALENDAR.ticksPerDay; i++) stepSim(s);
}

const wall = (x: number, y: number): PieceSpec => ({ kind: 'wall', x, y, thickness: 'standard', height: 'medium' });
const FULL_CREW = { mason: 4, carpenter: 2, digger: 2, carter: 2, labourer: 2 };

describe('calendar', () => {
  it('starts in spring, has winter at the end of the year, and skips winter when counting working days', () => {
    expect(dateOf(0)).toEqual({ year: 1, month: 0, day: 1, season: 'spring' });
    expect(dateOf(9 * 30).season).toBe('winter');
    expect(dateOf(12 * 30)).toEqual({ year: 2, month: 0, day: 1, season: 'spring' });
    expect(isWinter(9 * 30 - 1)).toBe(false);
    // 10 working days from the last autumn day jump the whole winter.
    expect(addWorkingDays(9 * 30 - 1, 10)).toBe(12 * 30 + 9);
  });
});

describe('workers and money', () => {
  it('hires over time up to the number wanted, and dismisses at once', () => {
    const s = simOn();
    setWanted(s.economy, 'labourer', 10);
    days(s, 1);
    expect(s.economy.workers.labourer).toBeLessThan(10);
    days(s, 20);
    expect(s.economy.workers.labourer).toBe(10);
    setWanted(s.economy, 'labourer', 4);
    expect(s.economy.workers.labourer).toBe(4);
  });

  it('hires faster on generous wages than on low ones', () => {
    const hired = (wage: 'low' | 'generous') => {
      const s = simOn();
      s.economy.wage = wage;
      setWanted(s.economy, 'mason', 30);
      days(s, 20);
      return s.economy.workers.mason;
    };
    expect(hired('generous')).toBeGreaterThan(hired('low'));
  });

  it('pays wages and feeds workers every day, at half pay in winter', () => {
    const s = simOn();
    staff(s, { mason: 10 });
    const before = { ...s.economy.stores };
    days(s, 1);
    expect(before.crowns - s.economy.stores.crowns).toBeCloseTo(30);
    expect(before.food - s.economy.stores.food).toBe(10);
    days(s, 9 * 30 - 1); // to the first day of winter
    const c = s.economy.stores.crowns;
    days(s, 1);
    expect(c - s.economy.stores.crowns).toBeCloseTo(15);
  });

  it('slows and loses workers who go unpaid or hungry', () => {
    const s = simOn();
    staff(s, { labourer: 20 });
    s.economy.stores.food = 0;
    days(s, 1);
    expect(s.economy.hungry).toBe(true);
    expect(efficiency(s.economy)).toBe(ECONOMY.hungryEfficiency);
    days(s, 30);
    expect(s.economy.workers.labourer).toBeLessThan(20);
    expect(s.log.some((l) => l.text.includes('walked off'))).toBe(true);
  });

  it('buys stone, timber, food and fill, if there is the money', () => {
    const s = simOn();
    s.economy.stores.crowns = 1000;
    const stone = s.economy.stores.stone;
    expect(buy(s.economy, 'stone')).toBeNull();
    expect(s.economy.stores.stone).toBe(stone + ECONOMY.lots.stone);
    expect(buy(s.economy, 'fill')).toBeNull();
    expect(s.economy.stores.spoil).toBe(ECONOMY.lots.fill);
    s.economy.stores.crowns = 1;
    expect(buy(s.economy, 'stone')).toMatch(/Not enough/);
  });

  it('collects taxes in the second spring, harvest dues in autumn, and levies cost standing', () => {
    const s = simOn();
    s.economy.levy = true;
    const crowns = s.economy.stores.crowns;
    days(s, 61); // the levy is raised on the first of April and of May
    expect(s.economy.stores.crowns).toBe(crowns + ECONOMY.levy * 2);
    expect(s.economy.standing).toBe(ECONOMY.start.standing - ECONOMY.levyStanding * 2);
    s.economy.levy = false;
    const food = s.economy.stores.food;
    days(s, 6 * 30 - 61 + 1); // just into autumn
    expect(s.economy.stores.food).toBeGreaterThan(food);
    const before = s.economy.stores.crowns;
    days(s, 12 * 30 - today(s));
    expect(dateOf(today(s))).toMatchObject({ year: 2, month: 0, day: 1 });
    expect(s.economy.stores.crowns).toBeGreaterThan(before);
    expect(s.log.some((l) => l.text.startsWith('Spring taxes'))).toBe(true);
  });
});

describe('construction', () => {
  it('builds a wall over several days, using its stone and timber', () => {
    const s = simOn();
    placePieces(s.map, s.plan, [wall(3, 3)]);
    staff(s, FULL_CREW);
    const cost = pieceCost(s.map, s.plan.pieces[0] as never);
    const stone = s.economy.stores.stone;
    days(s, 1);
    expect(s.works.pieces[s.plan.pieces[0]!.id]?.complete).toBe(false);
    expect(Object.values(s.works.crew['p1'] ?? {}).reduce((a, b) => a + (b ?? 0), 0)).toBeGreaterThan(0);
    days(s, 20);
    expect(s.works.pieces[s.plan.pieces[0]!.id]?.complete).toBe(true);
    expect(stone - s.economy.stores.stone).toBeCloseTo(cost.stone);
    expect(s.log.some((l) => l.text.includes('wall'))).toBe(true);
  });

  it('never finishes without masons, and says so', () => {
    const s = simOn();
    placePieces(s.map, s.plan, [wall(3, 3)]);
    staff(s, { labourer: 6, carpenter: 2 });
    days(s, 60);
    expect(s.works.pieces['1']?.complete).toBe(false);
    expect(s.works.status['p1']).toBe('Short on masons');
    const summary = summariseWorks(s.map, s.plan, s.economy, s.works, today(s));
    expect(summary.bottleneck).toMatch(/No masons/);
    expect(summary.finish).toBeNull();
  });

  it('stalls when the stone runs out', () => {
    const s = simOn();
    placePieces(s.map, s.plan, [wall(3, 3), wall(4, 3)]);
    s.economy.stores.stone = 10;
    staff(s, FULL_CREW);
    days(s, 30);
    expect(s.economy.stores.stone).toBeCloseTo(0);
    expect(Object.values(s.works.status)).toContain('Short on stone');
    expect(summariseWorks(s.map, s.plan, s.economy, s.works, today(s)).bottleneck).toMatch(/Stone/);
  });

  it('quarrymen make stone', () => {
    const s = simOn();
    staff(s, { quarryman: 5 });
    const stone = s.economy.stores.stone;
    days(s, 10);
    expect(s.economy.stores.stone).toBeCloseTo(stone + 5 * 10 * WORKERS.quarryman.stonePerDay);
  });

  it('digs earthworks level by level, changing the land and making spoil', () => {
    const s = simOn();
    s.plan.earthworks[5 * 12 + 5] = -2;
    staff(s, { digger: 3, labourer: 3 });
    days(s, 60);
    expect(s.map.heights[5 * 12 + 5]).toBe(0);
    expect(s.plan.earthworks[5 * 12 + 5]).toBe(0);
    expect(s.economy.stores.spoil).toBe(2 * EARTHWORKS.spoilPerLevel);
    expect(s.works.earthDone).toBeCloseTo(2 * EARTHWORKS.lowerLabour);
  });

  it('raising needs spoil, and waits for it', () => {
    const s = simOn();
    s.plan.earthworks[1] = 1;
    staff(s, { digger: 3, labourer: 3 });
    days(s, 10);
    expect(s.map.heights[1]).toBe(2);
    expect(s.works.status['e1']).toMatch(/Short on spoil/);
    expect(buy(s.economy, 'fill')).toBeNull();
    days(s, 10);
    expect(s.map.heights[1]).toBe(3);
    expect(s.economy.stores.spoil).toBe(ECONOMY.lots.fill - EARTHWORKS.spoilPerLevel);
  });

  it('builds a piece only once the earthworks under it are done', () => {
    const s = simOn();
    placePieces(s.map, s.plan, [wall(3, 3)]);
    s.plan.earthworks[3 * 12 + 3] = -1;
    staff(s, { ...FULL_CREW, digger: 1, labourer: 2, carter: 0 });
    days(s, 1);
    expect(s.works.status['p1']).toMatch(/earthworks/);
    days(s, 40);
    expect(s.map.heights[3 * 12 + 3]).toBe(1);
    expect(s.works.pieces['1']?.complete).toBe(true);
  });

  it('stops for winter and starts again in spring', () => {
    const s = simOn();
    const many: PieceSpec[] = [];
    for (let x = 1; x < 11; x++) many.push(wall(x, 2));
    for (let x = 10; x > 0; x--) many.push(wall(x, 3));
    placePieces(s.map, s.plan, many);
    placePieces(s.map, s.plan, [{ kind: 'keep', x: 4, y: 6 }]);
    staff(s, { mason: 1, carpenter: 1, digger: 1, labourer: 1 });
    days(s, 9 * 30 + 1);
    const done = JSON.stringify(s.works.pieces);
    days(s, 80);
    expect(JSON.stringify(s.works.pieces)).toBe(done);
    expect(s.works.crew).toEqual({});
    days(s, 15);
    expect(JSON.stringify(s.works.pieces)).not.toBe(done);
  });

  it('forgets progress on pieces that are removed', () => {
    const s = simOn();
    placePieces(s.map, s.plan, [wall(3, 3)]);
    staff(s, FULL_CREW);
    days(s, 2);
    expect(s.works.pieces['1']).toBeDefined();
    s.plan.pieces = [];
    days(s, 1);
    expect(s.works.pieces['1']).toBeUndefined();
  });

  it('estimates a finish date and names the bottleneck', () => {
    const s = simOn();
    placePieces(s.map, s.plan, [wall(3, 3), wall(4, 3), wall(5, 3)]);
    staff(s, { ...FULL_CREW, mason: 1 });
    days(s, 1);
    const summary = summariseWorks(s.map, s.plan, s.economy, s.works, today(s));
    expect(summary.finish).not.toBeNull();
    expect(summary.bottleneck).toMatch(/Masonry/);
    expect(summary.progress).toBeGreaterThan(0);
    expect(summary.progress).toBeLessThan(1);
  });
});

describe('determinism', () => {
  it('gives the same result for the same seed and orders, and survives a JSON round trip mid-run', () => {
    const run = () => {
      const s = createSim(1991);
      for (const t of WORKER_TYPES) setWanted(s.economy, t, 4);
      placePieces(s.map, s.plan, [wall(36, 30), wall(37, 30), wall(38, 30)]);
      days(s, 50);
      return s;
    };
    const a = run();
    expect(run()).toEqual(a);
    const b = JSON.parse(JSON.stringify(a)) as SimState;
    days(a, 100);
    days(b, 100);
    expect(b).toEqual(a);
  });
});

describe('taxes and warnings', () => {
  it('raises spring taxes as castle pieces are finished, not just planned', () => {
    const s = simOn();
    const before = taxDue(s.economy, summariseWorks(s.map, s.plan, s.economy, s.works, 0).builtLabour);
    placePieces(s.map, s.plan, [wall(3, 3), wall(4, 3)]);
    expect(taxDue(s.economy, summariseWorks(s.map, s.plan, s.economy, s.works, 0).builtLabour)).toBe(before);
    staff(s, FULL_CREW);
    days(s, 30);
    expect(taxDue(s.economy, summariseWorks(s.map, s.plan, s.economy, s.works, today(s)).builtLabour)).toBeGreaterThan(before);
  });

  it('warns once when food is running low', () => {
    const s = simOn();
    staff(s, { labourer: 10 });
    s.economy.stores.food = 120;
    days(s, 5);
    expect(s.log.filter((l) => l.text.startsWith('Food is running low'))).toHaveLength(1);
  });
});
