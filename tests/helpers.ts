import { expect } from 'vitest';
import { CALENDAR, JOB_MIX, TRADES } from '../src/data/economy';
import { pieceCost, placePieces, planReport, viewPlan, type PieceSpec } from '../src/sim/castle';
import { walkLine } from '../src/sim/site';
import { stepSim, type SimState } from '../src/sim/state';
import { zeroWork } from '../src/sim/works';

/** A square ring of walls on the Kestrel Ford hilltop, with four towers, a gatehouse and the keep. */
export function hilltopCastle(s: SimState, wall: Partial<Extract<PieceSpec, { kind: 'wall' }>> = {}, tower: Partial<Extract<PieceSpec, { kind: 'tower' }>> = {}): void {
  const w = (x: number, y: number): PieceSpec => ({ kind: 'wall', x, y, thickness: 'standard', height: 'medium', ...wall });
  const line = (a: [number, number], b: [number, number]) => {
    const out: PieceSpec[] = [];
    walkLine(a, b, (x, y) => out.push(w(x, y)));
    return out;
  };
  const [a, b] = [31, 41];
  for (const l of [line([a, a], [b, a]), line([b, a + 1], [b, b]), line([b - 1, b], [a, b]), line([a, b - 1], [a, a + 1])])
    expect(placePieces(s.map, s.plan, l).problem).toBeNull();
  for (const [x, y] of [[a, a], [b, a], [a, b], [b, b]] as const)
    expect(placePieces(s.map, s.plan, [{ kind: 'tower', x, y, shape: 'square', height: 'medium', ...tower }]).problem).toBeNull();
  expect(placePieces(s.map, s.plan, [{ kind: 'gatehouse', x: 36, y: a, axis: 'y' }]).problem).toBeNull();
  expect(placePieces(s.map, s.plan, [{ kind: 'keep', x: 33, y: 33 }]).problem).toBeNull();
  expect(planReport(s.map, viewPlan(s.map, s.plan)).ready).toBe(true);
}

/** Mark pieces as built (all of them, or those passing `which`), to this share of their work. */
export function build(s: SimState, share = 1, which: (p: SimState['plan']['pieces'][number]) => boolean = () => true): void {
  for (const p of s.plan.pieces) {
    if (!which(p)) continue;
    const done = zeroWork();
    const labour = pieceCost(s.map, p).labour;
    for (const t of TRADES) done[t] = labour * (JOB_MIX[p.kind][t] ?? 0) * share;
    s.works.pieces[p.id] = { done, complete: share >= 1 };
  }
}

export function days(s: SimState, n: number): void {
  for (let i = 0; i < n * CALENDAR.ticksPerDay; i++) stepSim(s);
}

/** Step until the battle in progress is over. Returns the ticks it took. */
export function fight(s: SimState, maxTicks = 30 * 400): number {
  let t = 0;
  while (s.defence.battle && t < maxTicks) {
    stepSim(s);
    t++;
  }
  return t;
}
