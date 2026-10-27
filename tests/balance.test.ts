import { describe, expect, it } from 'vitest';
import { CALENDAR, WORKER_TYPES } from '../src/data/economy';
import { dateOf, isWinter } from '../src/sim/calendar';
import { placePieces, planReport, viewPlan, type PieceSpec } from '../src/sim/castle';
import { buy, setWanted } from '../src/sim/economy';
import { walkLine } from '../src/sim/site';
import { createSim, stepSim, today, type SimState } from '../src/sim/state';
import { summariseWorks } from '../src/sim/works';

/** A square ring of medium walls on the Kestrel Ford hilltop, with four towers, a gatehouse and the keep. */
function hilltopCastle(s: SimState): void {
  const w = (x: number, y: number): PieceSpec => ({ kind: 'wall', x, y, thickness: 'standard', height: 'medium' });
  const line = (a: [number, number], b: [number, number]) => {
    const out: PieceSpec[] = [];
    walkLine(a, b, (x, y) => out.push(w(x, y)));
    return out;
  };
  const [a, b] = [31, 41];
  for (const l of [line([a, a], [b, a]), line([b, a + 1], [b, b]), line([b - 1, b], [a, b]), line([a, b - 1], [a, a + 1])])
    expect(placePieces(s.map, s.plan, l).problem).toBeNull();
  for (const [x, y] of [[a, a], [b, a], [a, b], [b, b]] as const)
    expect(placePieces(s.map, s.plan, [{ kind: 'tower', x, y, shape: 'square', height: 'medium' }]).problem).toBeNull();
  expect(placePieces(s.map, s.plan, [{ kind: 'gatehouse', x: 36, y: a, axis: 'y' }]).problem).toBeNull();
  expect(placePieces(s.map, s.plan, [{ kind: 'keep', x: 33, y: 33 }]).problem).toBeNull();
  expect(planReport(s.map, viewPlan(s.map, s.plan)).ready).toBe(true);
}

/**
 * A simple, sensible player: a steady crew in the building season, everyone dismissed for the winter,
 * food bought before it runs out and timber bought as needed.
 */
function play(s: SimState, crew: Partial<Record<(typeof WORKER_TYPES)[number], number>>, maxDays: number): number | null {
  for (let d = 0; d < maxDays; d++) {
    const winter = isWinter(today(s) + 1);
    for (const t of WORKER_TYPES) setWanted(s.economy, t, winter ? 0 : (crew[t] ?? 0));
    while (s.economy.stores.food < 400 && !buy(s.economy, 'food'));
    if (s.economy.stores.timber < 30) buy(s.economy, 'timber');
    for (let i = 0; i < CALENDAR.ticksPerDay; i++) stepSim(s);
    const summary = summariseWorks(s.map, s.plan, s.economy, s.works, today(s));
    if (summary.piecesDone === summary.piecesTotal) return today(s);
  }
  return null;
}

describe('balance (starting numbers)', () => {
  it('a modest crew takes more than one building season over a hilltop castle, finishing in the second', () => {
    const s = createSim(1991);
    s.defence.raids = false; // building pace on its own; raids are tested in battle.test.ts
    hilltopCastle(s);
    const done = play(s, { labourer: 6, digger: 2, carter: 2, quarryman: 8, mason: 6, carpenter: 3 }, 2 * 360);
    expect(done).not.toBeNull();
    expect(dateOf(done as number).year).toBe(2);
  });

  it("money, not just labour, limits a big crew: it can't keep them paid through the first year", () => {
    const s = createSim(1991);
    s.defence.raids = false;
    hilltopCastle(s);
    play(s, { labourer: 20, digger: 8, carter: 8, quarryman: 20, mason: 20, carpenter: 10 }, 200);
    expect(s.log.some((l) => l.text.includes('unpaid'))).toBe(true);
  });
});
