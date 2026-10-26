import { EARTHWORKS, type Cost } from '../data/castle';
import {
  CREW_LIMIT,
  JOB_MIX,
  TRADE_NAMES,
  TRADES,
  WORKER_TYPES,
  WORKERS,
  type Trade,
  type WorkerType,
} from '../data/economy';
import { addWorkingDays } from './calendar';
import { footprint, pieceCost, pieceName, planReport, viewPlan, type CastlePlan, type Piece } from './castle';
import { efficiency, type EconomyState } from './economy';
import type { TerrainMap } from './terrain';

/** Worker-days of each trade. */
export type Work = Record<Trade, number>;

export interface PieceWork {
  done: Work;
  complete: boolean;
}

/** One level of earthworks under way on a tile. */
export interface EarthWork {
  done: Work;
  /** +1 raising, -1 lowering. */
  dir: 1 | -1;
  /** Raising takes its spoil from the store when it starts. */
  spoilTaken: boolean;
}

/** Building progress. Plain data, keyed by piece id and by tile index, so it goes into saves. */
export interface WorksState {
  pieces: Record<string, PieceWork>;
  earth: Record<string, EarthWork>;
  /** Worker-days of earthworks finished so far. */
  earthDone: number;
  /** Who worked on each job today, by job key ('p' + piece id, 'e' + tile index). */
  crew: Record<string, Partial<Record<WorkerType, number>>>;
  /** Why each job was stopped or slowed today, if it was. */
  status: Record<string, string>;
  /** Workers with nothing to do today. */
  idle: Partial<Record<WorkerType, number>>;
}

export function createWorks(): WorksState {
  return { pieces: {}, earth: {}, earthDone: 0, crew: {}, status: {}, idle: {} };
}

export function zeroWork(): Work {
  return { masonry: 0, carpentry: 0, digging: 0, hauling: 0 };
}

function sumWork(w: Work): number {
  return w.masonry + w.carpentry + w.digging + w.hauling;
}

export interface Job {
  key: string;
  name: string;
  piece: Piece | null;
  /** Tile index, for earthworks. */
  tile: number;
  need: Work;
  done: Work;
  /** Materials for the whole job (negative timber: the job gives timber, from clearing trees). */
  stone: number;
  timber: number;
  /** Raising needs this much spoil before it starts. */
  spoil: number;
  crewLimit: number;
  /** Why the job can't go ahead at all, if it can't. */
  blocked: string | null;
}

/** Specialists are put to work before labourers, who fill in where the trades run out. */
const HIRING_ORDER: readonly WorkerType[] = [...WORKER_TYPES.filter((t) => t !== 'labourer'), 'labourer'];

function split(labour: number, mix: Partial<Record<Trade, number>>): Work {
  const w = zeroWork();
  for (const t of TRADES) w[t] = labour * (mix[t] ?? 0);
  return w;
}

/**
 * Every unfinished job, in the order workers take them: earthworks first (the land has to be
 * shaped before anything stands on it), then pieces in the order they were placed.
 */
export function listJobs(map: TerrainMap, plan: CastlePlan, works: WorksState): Job[] {
  const jobs: Job[] = [];
  const pieceOn = new Map<number, Piece>();
  for (const p of plan.pieces) for (const [x, y] of footprint(p)) pieceOn.set(y * map.width + x, p);

  plan.earthworks.forEach((d, i) => {
    if (d === 0) return;
    const dir = d > 0 ? 1 : -1;
    const labour = dir > 0 ? EARTHWORKS.raiseLabour : EARTHWORKS.lowerLabour;
    const rec = works.earth[i];
    const standing = pieceOn.get(i);
    const started = standing && (works.pieces[standing.id]?.complete || sumWork(works.pieces[standing.id]?.done ?? zeroWork()) > 0);
    jobs.push({
      key: `e${i}`,
      name: `${dir > 0 ? 'Raise' : 'Lower'} ground at ${i % map.width}, ${Math.floor(i / map.width)}`,
      piece: null,
      tile: i,
      need: split(labour, JOB_MIX[dir > 0 ? 'raise' : 'lower']),
      done: rec && rec.dir === dir ? rec.done : zeroWork(),
      stone: 0,
      timber: 0,
      spoil: dir > 0 && !rec?.spoilTaken ? EARTHWORKS.spoilPerLevel : 0,
      crewLimit: CREW_LIMIT.earth,
      blocked: started ? 'A piece already stands here' : null,
    });
  });

  const report = planReport(map, viewPlan(map, plan));
  const problems = new Map(report.problems.map((p) => [p.piece.id, p.text]));
  for (const p of plan.pieces) {
    const rec = works.pieces[p.id];
    if (rec?.complete) continue;
    const cost: Cost = pieceCost(map, p);
    const waiting = footprint(p).some(([x, y]) => (plan.earthworks[y * map.width + x] ?? 0) !== 0);
    jobs.push({
      key: `p${p.id}`,
      name: `${pieceName(p)} at ${p.x}, ${p.y}`,
      piece: p,
      tile: p.y * map.width + p.x,
      need: split(cost.labour, JOB_MIX[p.kind]),
      done: rec?.done ?? zeroWork(),
      stone: cost.stone,
      timber: cost.timber,
      spoil: 0,
      crewLimit: CREW_LIMIT[p.kind],
      blocked: problems.get(p.id) ?? (waiting ? 'Waiting for the earthworks under it' : null),
    });
  }
  return jobs;
}

export interface DayResult {
  /** Tile indices whose height changed today. */
  land: number[];
  /** Names of pieces finished today. */
  finished: string[];
  /** Whether any piece's progress changed (for redrawing). */
  pieces: boolean;
}

/**
 * One working day: quarrymen cut stone, and every other worker is put on the first jobs that
 * need their trade, up to each job's crew limit. Materials are used as the work is done; a job
 * short of stone, timber or spoil goes as far as the stores allow. Finished earthworks change
 * the land itself.
 */
export function workDay(map: TerrainMap, plan: CastlePlan, econ: EconomyState, works: WorksState): DayResult {
  const result: DayResult = { land: [], finished: [], pieces: false };
  const eff = efficiency(econ);
  const stores = econ.stores;
  stores.stone += econ.workers.quarryman * WORKERS.quarryman.stonePerDay * eff;

  const free = { ...econ.workers, quarryman: 0 };
  works.crew = {};
  works.status = {};
  const jobs = listJobs(map, plan, works);
  forgetRemoved(plan, econ, works, jobs);

  for (const job of jobs) {
    // A finished piece given an extra and then had it taken off again is finished already.
    if (job.piece && TRADES.every((t) => job.done[t] >= job.need[t] - 1e-6)) {
      works.pieces[job.piece.id] = { done: { ...job.done }, complete: true };
      result.pieces = true;
      continue;
    }
    if (job.blocked) {
      works.status[job.key] = job.blocked;
      continue;
    }
    if (job.spoil > 0) {
      if (stores.spoil < job.spoil) {
        works.status[job.key] = 'Short on spoil: dig elsewhere or buy fill';
        continue;
      }
      stores.spoil -= job.spoil;
      works.earth[job.tile] = { done: zeroWork(), dir: 1, spoilTaken: true };
    }

    const crew: Partial<Record<WorkerType, number>> = {};
    const work = zeroWork();
    const short: Trade[] = [];
    const totalNeed = sumWork(job.need);
    for (const t of TRADES) {
      const left = job.need[t] - job.done[t];
      if (left <= 1e-9) continue;
      const cap = Math.max(1, Math.round((job.crewLimit * job.need[t]) / totalNeed));
      let hands = 0;
      // Specialists first, then labourers where they can help.
      for (const type of HIRING_ORDER) {
        const rate = (WORKERS[type].rates[t] ?? 0) * eff;
        if (rate <= 0 || free[type] <= 0 || hands >= cap || work[t] >= left - 1e-9) continue;
        const n = Math.min(free[type], cap - hands, Math.ceil((left - work[t]) / rate - 1e-9));
        free[type] -= n;
        hands += n;
        work[t] += n * rate;
        crew[type] = (crew[type] ?? 0) + n;
      }
      work[t] = Math.min(work[t], left);
      if (work[t] < left - 1e-9 && hands < cap) short.push(t);
    }

    // Materials go in as the work does; with too little in store, the day's work is cut back.
    const total = sumWork(work);
    if (total <= 0) {
      if (short.length > 0) works.status[job.key] = `Short on ${TRADE_NAMES[short[0] as Trade].who}`;
      continue;
    }
    let scale = 1;
    const perWork = { stone: job.stone / totalNeed, timber: job.timber / totalNeed };
    if (perWork.stone > 0 && stores.stone < total * perWork.stone) {
      scale = Math.min(scale, stores.stone / (total * perWork.stone));
      works.status[job.key] = 'Short on stone';
    }
    if (perWork.timber > 0 && stores.timber < total * perWork.timber) {
      scale = Math.min(scale, stores.timber / (total * perWork.timber));
      works.status[job.key] = 'Short on timber';
    }
    if (scale <= 0) continue;
    // Clamp away rounding dust so the stores never show a hair below zero.
    stores.stone = Math.max(0, stores.stone - total * scale * perWork.stone);
    stores.timber = Math.max(0, stores.timber - total * scale * perWork.timber);
    if (!works.status[job.key] && short.length > 0) works.status[job.key] = `Short on ${TRADE_NAMES[short[0] as Trade].who}`;
    works.crew[job.key] = crew;

    const done = { ...job.done };
    for (const t of TRADES) done[t] += work[t] * scale;
    const complete = TRADES.every((t) => done[t] >= job.need[t] - 1e-6);

    if (job.piece) {
      result.pieces = true;
      works.pieces[job.piece.id] = { done, complete };
      if (complete) result.finished.push(job.name);
    } else if (complete) {
      const dir = (plan.earthworks[job.tile] ?? 0) > 0 ? 1 : -1;
      map.heights[job.tile] = (map.heights[job.tile] ?? 0) + dir;
      plan.earthworks[job.tile] = (plan.earthworks[job.tile] ?? 0) - dir;
      if (dir < 0) stores.spoil += EARTHWORKS.spoilPerLevel;
      works.earthDone += totalNeed;
      delete works.earth[job.tile];
      result.land.push(job.tile);
    } else {
      const dir = (plan.earthworks[job.tile] ?? 0) > 0 ? 1 : -1;
      works.earth[job.tile] = { done, dir, spoilTaken: dir > 0 };
    }
  }

  works.idle = {};
  for (const t of WORKER_TYPES) if (free[t] > 0) works.idle[t] = free[t];
  return result;
}

/** Drop progress for pieces that were removed, and earthworks that were unmarked (giving back their spoil). */
function forgetRemoved(plan: CastlePlan, econ: EconomyState, works: WorksState, jobs: readonly Job[]): void {
  const ids = new Set(plan.pieces.map((p) => String(p.id)));
  for (const id of Object.keys(works.pieces)) if (!ids.has(id)) delete works.pieces[id];
  const keys = new Set(jobs.map((j) => j.key));
  for (const [i, rec] of Object.entries(works.earth)) {
    const d = plan.earthworks[Number(i)] ?? 0;
    if (keys.has(`e${i}`) && Math.sign(d) === rec.dir) continue;
    if (rec.spoilTaken) econ.stores.spoil += EARTHWORKS.spoilPerLevel;
    delete works.earth[i];
  }
}

/** How far along a piece is, 0 to 1 (1 when finished). */
export function pieceProgress(map: TerrainMap, works: WorksState, p: Piece): number {
  const rec = works.pieces[p.id];
  if (!rec) return 0;
  if (rec.complete) return 1;
  const need = pieceCost(map, p).labour;
  return need > 0 ? Math.min(1, sumWork(rec.done) / need) : 0;
}

export interface JobEstimate {
  job: Job;
  progress: number;
  /** Day number it should finish on at the current rate, or null if it never will as things stand. */
  finish: number | null;
  status: string | null;
  crew: number;
}

export interface WorksSummary {
  jobs: JobEstimate[];
  /** Share of all planned work done so far, 0 to 1. */
  progress: number;
  /** Share of the castle's pieces built (by labour), 0 to 1. */
  built: number;
  /** Worker-days that went into finished pieces. Taxes rise with this. */
  builtLabour: number;
  piecesDone: number;
  piecesTotal: number;
  /** Day number when everything should be finished, or null. */
  finish: number | null;
  /** The thing holding the whole build back most, in plain words; null with nothing to build. */
  bottleneck: string | null;
  /** Materials that will run short before the work is done. */
  warnings: string[];
  /** Per trade: worker-days left, and worker-days a day the current crew manages. */
  trades: Record<Trade, { left: number; perDay: number }>;
  stoneNeeded: number;
  timberNeeded: number;
  spoilNeeded: number;
}

/** Estimate the build: what's left, how fast it's going, when each job should finish, and what is slowing it. */
export function summariseWorks(map: TerrainMap, plan: CastlePlan, econ: EconomyState, works: WorksState, today: number): WorksSummary {
  const jobs = listJobs(map, plan, works);
  const eff = efficiency(econ);
  const trades = Object.fromEntries(TRADES.map((t) => [t, { left: 0, perDay: 0 }])) as WorksSummary['trades'];
  for (const job of jobs) for (const t of TRADES) trades[t].left += Math.max(0, job.need[t] - job.done[t]);

  // Specialist capacity, then labourers shared between digging and hauling by what's left of each.
  for (const type of WORKER_TYPES) {
    if (type === 'labourer') continue;
    for (const t of TRADES) trades[t].perDay += econ.workers[type] * (WORKERS[type].rates[t] ?? 0) * eff;
  }
  const labourWanted = trades.digging.left + trades.hauling.left;
  for (const t of ['digging', 'hauling'] as const) {
    const share = labourWanted > 0 ? trades[t].left / labourWanted : 0.5;
    trades[t].perDay += econ.workers.labourer * (WORKERS.labourer.rates[t] ?? 0) * eff * share;
  }

  let stoneNeeded = 0;
  let timberNeeded = 0;
  let spoilNeeded = 0;
  for (const job of jobs) {
    const left = 1 - sumWork(job.done) / Math.max(1e-9, sumWork(job.need));
    stoneNeeded += Math.max(0, job.stone * left);
    timberNeeded += Math.max(0, job.timber * left);
    spoilNeeded += job.spoil;
  }
  const quarry = econ.workers.quarryman * WORKERS.quarryman.stonePerDay * eff;

  const cum = zeroWork();
  let cumStone = 0;
  const estimates: JobEstimate[] = jobs.map((job) => {
    let days = 0;
    for (const t of TRADES) {
      const left = Math.max(0, job.need[t] - job.done[t]);
      cum[t] += left;
      if (left > 0) days = Math.max(days, trades[t].perDay > 0 ? cum[t] / trades[t].perDay : Infinity);
    }
    const left = 1 - sumWork(job.done) / Math.max(1e-9, sumWork(job.need));
    cumStone += Math.max(0, job.stone * left);
    if (cumStone > econ.stores.stone) days = Math.max(days, quarry > 0 ? (cumStone - econ.stores.stone) / quarry : Infinity);
    const progress = Math.min(1, sumWork(job.done) / Math.max(1e-9, sumWork(job.need)));
    const crew = Object.values(works.crew[job.key] ?? {}).reduce((a, b) => a + (b ?? 0), 0);
    return {
      job,
      progress,
      finish: job.blocked || !Number.isFinite(days) ? null : addWorkingDays(today, days),
      status: job.blocked ?? works.status[job.key] ?? null,
      crew,
    };
  });

  let pieceNeed = 0;
  let pieceDone = 0;
  let piecesDone = 0;
  let builtLabour = 0;
  for (const p of plan.pieces) {
    const need = pieceCost(map, p).labour;
    const rec = works.pieces[p.id];
    pieceNeed += need;
    if (rec?.complete) {
      pieceDone += need;
      builtLabour += need;
      piecesDone++;
    } else if (rec) pieceDone += Math.min(need, sumWork(rec.done));
  }
  const earthLeft = jobs.filter((j) => !j.piece).reduce((s, j) => s + sumWork(j.need) - sumWork(j.done), 0);
  const earthHere = Object.values(works.earth).reduce((s, r) => s + sumWork(r.done), 0);
  const all = pieceNeed + works.earthDone + earthHere + earthLeft;

  const finishes = estimates.map((e) => e.finish);
  const finish = jobs.length === 0 ? today : finishes.some((f) => f === null) ? null : Math.max(today, ...(finishes as number[]));

  return {
    jobs: estimates,
    progress: all > 0 ? (pieceDone + works.earthDone + earthHere) / all : 0,
    built: pieceNeed > 0 ? pieceDone / pieceNeed : 0,
    builtLabour,
    piecesDone,
    piecesTotal: plan.pieces.length,
    finish,
    bottleneck: bottleneck(jobs.length, trades, econ, { stoneNeeded, timberNeeded, spoilNeeded, quarry }),
    warnings: warnings(econ, { stoneNeeded, timberNeeded, spoilNeeded, quarry }),
    trades,
    stoneNeeded,
    timberNeeded,
    spoilNeeded,
  };
}

function bottleneck(
  jobCount: number,
  trades: WorksSummary['trades'],
  econ: EconomyState,
  m: { stoneNeeded: number; timberNeeded: number; spoilNeeded: number; quarry: number },
): string | null {
  if (jobCount === 0) return null;
  if (econ.unpaid) return 'Wages are unpaid: workers are slow and leaving. Raise money or dismiss workers.';
  if (econ.hungry) return 'The food store is empty: workers are slow and leaving. Buy food.';
  let worst: { days: number; text: string } | null = null;
  const consider = (days: number, text: string) => {
    if (!worst || days > worst.days) worst = { days, text };
  };
  for (const t of TRADES) {
    const { left, perDay } = trades[t];
    if (left <= 0.01) continue;
    const who = TRADE_NAMES[t].who;
    if (perDay <= 0) consider(Infinity, `No ${who} on site: ${Math.ceil(left)} worker-days of ${TRADE_NAMES[t].name.toLowerCase()} waiting`);
    else consider(left / perDay, `${TRADE_NAMES[t].name}: ${Math.ceil(left / perDay)} days left at the current crew (hire more ${who})`);
  }
  const stoneShort = m.stoneNeeded - econ.stores.stone;
  if (stoneShort > 0.5) {
    if (m.quarry <= 0) consider(Infinity, `Stone: ${Math.ceil(stoneShort)} more needed and no quarrymen (hire some, or buy stone)`);
    else consider(stoneShort / m.quarry, `Stone: ${Math.ceil(stoneShort)} more needed, quarrying ${m.quarry.toFixed(1)} a day`);
  }
  // Timber and spoil only come from buying (or clearing trees and digging), so they hold things up once they run out.
  if (m.timberNeeded > 0.5 && econ.stores.timber < 1) consider(Infinity, 'Timber: the store is empty (buy some in the Workers tab)');
  if (m.spoilNeeded > 0 && econ.stores.spoil < m.spoilNeeded)
    consider(Infinity, 'Spoil: raising ground needs more (dig elsewhere first, or buy fill)');
  return (worst as { days: number; text: string } | null)?.text ?? null;
}

/** Shortfalls to warn about before they stop the work. */
function warnings(econ: EconomyState, m: { stoneNeeded: number; timberNeeded: number; spoilNeeded: number; quarry: number }): string[] {
  const out: string[] = [];
  const stone = Math.ceil(m.stoneNeeded - econ.stores.stone);
  if (stone > 0 && m.quarry <= 0) out.push(`${stone} more stone needed, and no quarrymen`);
  const timber = Math.ceil(m.timberNeeded - econ.stores.timber);
  if (timber > 0) out.push(`${timber} more timber needed`);
  const spoil = Math.ceil(m.spoilNeeded - econ.stores.spoil);
  if (spoil > 0) out.push(`${spoil} more cartloads of spoil needed to raise ground`);
  return out;
}

/** A piece given more work (an extra added after it was finished) goes back on the building list. */
export function reopenPiece(works: WorksState, id: number): void {
  const rec = works.pieces[id];
  if (rec) rec.complete = false;
}
