import { CALENDAR, ECONOMY } from '../data/economy';
import { kestrelFord } from '../data/sites/kestrelFord';
import { dateOf, formatDate, isWinter } from './calendar';
import { createPlan, type CastlePlan } from './castle';
import { collectHarvest, collectTaxes, createEconomy, efficiency, hire, mouths, newMonth, payAndFeed, totalWorkers, type EconomyState } from './economy';
import { Rng } from './rng';
import { chooseApproach, endBattle, startBattle, stepBattle } from './battle';
import { addReport, createDefence, describeStrength, raidStrength, scheduleRaid, type DefenceState } from './defence';
import { RAIDS } from '../data/combat';
import { buildSite, type Point, type SiteDef } from './site';
import type { TerrainMap } from './terrain';
import { createWorks, summariseWorks, workDay, type WorksState } from './works';

/** One point on the report graphs. */
export interface Sample {
  day: number;
  crowns: number;
  food: number;
  stone: number;
  workers: number;
  /** 0 to 1. */
  efficiency: number;
  progress: number;
}

export interface LogEntry {
  day: number;
  text: string;
}

/** Everything the simulation owns. Plain data, so it can be serialised for saves. */
export interface SimState {
  seed: number;
  tick: number;
  rngState: number;
  siteId: string;
  siteName: string;
  /** The land as it is now; finished earthworks change it. */
  map: TerrainMap;
  /** The castle design: pieces, and earthworks still to do (as changes from the land now). */
  plan: CastlePlan;
  /** Where the workers' camp and stores stand. */
  camp: Point;
  economy: EconomyState;
  works: WorksState;
  /** Raids, the garrison's posts, and any battle being fought. */
  defence: DefenceState;
  history: Sample[];
  /** Recent happenings, newest last. */
  log: LogEntry[];
}

/** What changed on a tick, so the renderer knows what to redraw. */
export interface TickEvents {
  /** A new day began (and the day's work was done). */
  newDay: boolean;
  newMonth: boolean;
  /** Tile indices whose height changed. */
  land: number[];
  pieces: boolean;
  /** Scouts brought word of a raid. */
  raidWarning: boolean;
  battleStarted: boolean;
  battleEnded: boolean;
  /** A battle is being fought (the calendar stands still meanwhile). */
  battle: boolean;
}

const LOG_LENGTH = 40;

export function createSim(seed: number, site: SiteDef = kestrelFord): SimState {
  const rng = new Rng(seed);
  const map = buildSite(site);
  const defence = createDefence(rng);
  return {
    seed,
    tick: 0,
    rngState: rng.getState(),
    siteId: site.id,
    siteName: site.name,
    map,
    plan: createPlan(map),
    camp: site.camp ?? [Math.floor(site.width / 2), Math.floor(site.height / 2)],
    economy: createEconomy(),
    works: createWorks(),
    defence,
    history: [],
    log: [{ day: 0, text: 'You arrive at the site with a purse from the crown. Plan the castle, then hire workers.' }],
  };
}

export function today(state: SimState): number {
  return Math.floor(state.tick / CALENDAR.ticksPerDay);
}

export function addLog(state: SimState, text: string): void {
  state.log.push({ day: today(state), text });
  if (state.log.length > LOG_LENGTH) state.log.splice(0, state.log.length - LOG_LENGTH);
}

/** Advance the simulation by exactly one fixed tick. Everything that happens, happens at the start of a day. */
export function stepSim(state: SimState): TickEvents {
  const events: TickEvents = { newDay: false, newMonth: false, land: [], pieces: false, raidWarning: false, battleStarted: false, battleEnded: false, battle: false };
  if (state.defence.battle) {
    stepBattleTick(state, events);
    return events;
  }
  state.tick++;
  if (state.tick % CALENDAR.ticksPerDay !== 0) return events;
  events.newDay = true;
  const day = today(state);
  const date = dateOf(day);
  const winter = isWinter(day);
  const e = state.economy;
  const rng = new Rng(state.rngState);

  if (date.day === 1) {
    events.newMonth = true;
    const levy = newMonth(e);
    if (levy > 0) addLog(state, `Levy raised: +${levy} crowns. People grumble (standing ${Math.round(e.standing)}).`);
    if (date.month === 0 && date.year > 1) {
      const built = summariseWorks(state.map, state.plan, e, state.works, day).builtLabour;
      addLog(state, `Spring taxes collected: +${collectTaxes(e, built)} crowns.`);
    }
    if (date.season === 'autumn' && CALENDAR.seasons[date.month - 1] !== 'autumn')
      addLog(state, `Harvest dues: +${collectHarvest(e)} rations of food.`);
    if (date.season === 'winter' && CALENDAR.seasons[date.month - 1] !== 'winter')
      addLog(state, 'Winter: building stops until spring. Workers are kept on at half pay.');
    if (date.month === 0 && date.year > 1) addLog(state, 'Spring: building starts again.');
  }

  hire(e, rng, winter);
  const lowFood = (food: number) => food < mouths(e) * ECONOMY.rationsPerWorker * ECONOMY.lowFoodDays;
  const wasLow = lowFood(e.stores.food);
  const left = payAndFeed(e, rng, winter);
  if (!wasLow && lowFood(e.stores.food) && e.stores.food > 0)
    addLog(state, `Food is running low: about ${Math.floor(e.stores.food / Math.max(1, mouths(e)))} days left. Buy food in the Workers tab.`);
  if (left > 0) {
    // One running entry for a spell of walk-offs, rather than a line every day.
    const last = state.log[state.log.length - 1];
    const earlier = last && last.day >= day - 10 ? /^(\d+) workers? (?:has|have) walked off/.exec(last.text) : null;
    const total = left + (earlier ? Number(earlier[1]) : 0);
    if (earlier) state.log.pop();
    addLog(state, `${total} ${total === 1 ? 'worker has' : 'workers have'} walked off the site (${e.unpaid ? 'unpaid' : 'hungry'}).`);
  }

  if (!winter && totalWorkers(e) > 0) {
    const result = workDay(state.map, state.plan, e, state.works);
    events.land = result.land;
    events.pieces = result.pieces;
    const isWall = (n: string) => / wall at /.test(n);
    for (const name of result.finished) if (!isWall(name)) addLog(state, `Finished: ${name}.`);
    const walls = result.finished.filter(isWall).length;
    if (walls > 0) addLog(state, `Finished ${walls} ${walls === 1 ? 'tile' : 'tiles'} of wall.`);
  } else {
    state.works.crew = {};
    state.works.idle = winter ? { ...e.workers } : {};
  }

  if (day % ECONOMY.sampleDays === 0) {
    const summary = summariseWorks(state.map, state.plan, e, state.works, day);
    state.history.push({
      day,
      crowns: Math.round(e.stores.crowns),
      food: Math.round(e.stores.food),
      stone: Math.round(e.stores.stone),
      workers: totalWorkers(e),
      efficiency: totalWorkers(e) > 0 ? efficiency(e) : 0,
      progress: summary.progress,
    });
    if (state.history.length > ECONOMY.maxSamples) state.history.splice(0, state.history.length - ECONOMY.maxSamples);
  }

  if (state.defence.raids) raidCheck(state, rng, day, events);

  state.rngState = rng.getState();
  return events;
}

/** Scouts warn of a raid some days ahead; on the day, the raiders arrive and the battle starts. */
function raidCheck(state: SimState, rng: Rng, day: number, events: TickEvents): void {
  const d = state.defence;
  if (!d.warned && day >= d.nextRaid - RAIDS.warningDays && day < d.nextRaid) {
    d.warned = true;
    events.raidWarning = true;
    // The raiders' scouts have looked the castle over too: they come where it looks weakest.
    d.from = chooseApproach(state, rng);
    addLog(
      state,
      `Scouts report raiders gathering to the ${d.from}: ${describeStrength(raidStrength(d.raidCount + 1))}, expected about ${formatDate(d.nextRaid)}. Post your soldiers with the Troops tool (0).`,
    );
  }
  if (day >= d.nextRaid) beginBattle(state, rng, events);
}

function beginBattle(state: SimState, rng: Rng, events: TickEvents): void {
  state.defence.battle = startBattle(state, rng);
  const b = state.defence.battle;
  events.battleStarted = true;
  events.battle = true;
  addLog(state, `Raiders attack from the ${b.from}, making for ${b.target === 'keep' ? 'the keep' : 'the camp'}! Building stops while the battle is fought.`);
}

function stepBattleTick(state: SimState, events: TickEvents): void {
  const rng = new Rng(state.rngState);
  const r = stepBattle(state, rng);
  events.battle = true;
  events.pieces = r.pieces;
  if (r.ended) {
    const day = today(state);
    const report = endBattle(state, day);
    addReport(state.defence, report);
    addLog(state, report.headline);
    scheduleRaid(state.defence, rng, day);
    events.battleEnded = true;
    events.pieces = true;
  }
  state.rngState = rng.getState();
}

/** Bring the next raid on now, without waiting for it (for playtesting the defences). */
export function raidNow(state: SimState): TickEvents {
  const events: TickEvents = { newDay: false, newMonth: false, land: [], pieces: true, raidWarning: false, battleStarted: false, battleEnded: false, battle: false };
  if (state.defence.battle) return events;
  const rng = new Rng(state.rngState);
  beginBattle(state, rng, events);
  state.rngState = rng.getState();
  return events;
}

export function dateLine(state: SimState): string {
  return formatDate(today(state));
}
