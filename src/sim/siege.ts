import { SIEGE } from '../data/combat';
import type { BattleReport, ReportLine } from './battle';
import { footprint } from './castle';
import { addReport, scheduleRaid, type Edge } from './defence';
import type { Rng } from './rng';
import type { SimState } from './state';
import { inBounds, terrainAt } from './terrain';

/**
 * A siege: raiders whose assault failed camp round the castle and try to starve it out. Both sides
 * eat from what they have; whoever runs short first gives in. Plain data, so it goes into saves.
 */
export interface SiegeState {
  raid: number;
  from: Edge;
  /** Day it began. */
  day: number;
  /** Besiegers in the camp now, and when it began. */
  raiders: number;
  start: number;
  /** Days of food the besiegers have left. */
  supplies: number;
  /** Besiegers' morale, out of 100; at 0 they give up and go. */
  morale: number;
  /** Days in a row your stores have stood empty. */
  hungryDays: number;
  /** Food in your stores when it began, for the report. */
  foodAtStart: number;
  /** Where they camp: a tile out of bowshot on their side of the castle. */
  camp: number;
}

/** Does this raid bring a siege train? */
export function isSiegeRaid(raid: number): boolean {
  const b = SIEGE.blockade;
  return raid >= b.from && (raid - b.from) % b.every === 0;
}

/** Days of food a siege raid brings. */
export function siegeSupplies(raid: number): number {
  return SIEGE.blockade.supplies.base + SIEGE.blockade.supplies.perRaid * raid;
}

/** What it costs to buy the besiegers off now. */
export function bribeCost(s: SiegeState): number {
  return SIEGE.blockade.bribePerRaider * s.raiders;
}

/**
 * Raiders whose assault failed settle in to besiege the castle, if they brought a siege train and
 * enough of them are left. Returns the siege, or null if they go home.
 */
export function beginSiege(state: SimState, raid: number, from: Edge, raidersLeft: number, day: number): SiegeState | null {
  if (!isSiegeRaid(raid) || raidersLeft < SIEGE.blockade.minRaiders) return null;
  const siege: SiegeState = {
    raid,
    from,
    day,
    raiders: raidersLeft,
    start: raidersLeft,
    supplies: siegeSupplies(raid),
    morale: 100,
    hungryDays: 0,
    foodAtStart: Math.round(state.economy.stores.food),
    camp: campTile(state, from),
  };
  state.defence.siege = siege;
  return siege;
}

/** A tile on their side, about `campDistance` from the nearest piece (beyond bowshot), on open walkable ground. */
export function campTile(state: SimState, from: Edge): number {
  const { map, plan } = state;
  const built: [number, number][] = plan.pieces.flatMap((p) => footprint(p));
  if (built.length === 0) built.push([state.camp[0], state.camp[1]]);
  const toEdge = (x: number, y: number) =>
    from === 'north-west' ? x : from === 'north-east' ? y : from === 'south-east' ? map.width - 1 - x : map.height - 1 - y;
  let best = -1;
  let bestScore = Infinity;
  for (let y = 0; y < map.height; y++)
    for (let x = 0; x < map.width; x++) {
      if (!inBounds(map, x, y) || terrainAt(map, x, y).moveCost !== 1) continue;
      let near = Infinity;
      for (const [px, py] of built) near = Math.min(near, Math.hypot(px - x, py - y));
      if (near < SIEGE.blockade.campDistance - 0.5) continue;
      const score = Math.abs(near - SIEGE.blockade.campDistance) + 0.4 * toEdge(x, y);
      if (score < bestScore) {
        bestScore = score;
        best = y * map.width + x;
      }
    }
  return best >= 0 ? best : 0;
}

export interface SiegeDay {
  /** Things worth a line in the log. */
  log: string[];
  /** The siege ended today (the report is filed and the next raid scheduled). */
  ended: BattleReport | null;
}

/**
 * One day of the siege, after your people have eaten: the besiegers eat too, your archers pick off
 * any who come near, and whoever has run out of food or heart gives in.
 */
export function siegeDay(state: SimState, rng: Rng, day: number): SiegeDay {
  const s = state.defence.siege as SiegeState;
  const cfg = SIEGE.blockade;
  const out: SiegeDay = { log: [], ended: null };
  const hadFood = s.supplies > 0;
  s.supplies = Math.max(0, s.supplies - 1);
  s.morale -= cfg.moraleDaily;
  if (hadFood && s.supplies === 0) out.log.push('The besiegers have eaten the last of their food. They won\'t last long now.');
  if (s.supplies === 0) s.morale -= cfg.moraleHungry;

  let killed = 0;
  for (let i = 0; i < state.economy.troops.archer; i++) if (rng.next() < cfg.pickOff) killed++;
  killed = Math.min(killed, s.raiders);
  s.raiders -= killed;
  s.morale -= killed * cfg.moralePerLoss;

  const e = state.economy;
  if (e.hungry) {
    s.hungryDays++;
    if (s.hungryDays === 1) out.log.push(`Your stores are empty and nothing can be brought in. The castle can hold out ${cfg.starveDays} more days.`);
  } else s.hungryDays = 0;

  if (s.hungryDays >= cfg.starveDays) out.ended = endSiege(state, rng, day, 'yielded');
  else if (s.morale <= 0 || s.raiders < cfg.minRaiders / 2) out.ended = endSiege(state, rng, day, 'lifted');
  return out;
}

/** Pay the besiegers to go. Returns a problem, or the report if they went. */
export function buyOffSiege(state: SimState, rng: Rng, day: number): { problem: string | null; report: BattleReport | null } {
  const s = state.defence.siege;
  if (!s) return { problem: 'There is no siege to end', report: null };
  const cost = bribeCost(s);
  if (state.economy.stores.crowns < cost) return { problem: `Not enough crowns (they want ${cost})`, report: null };
  state.economy.stores.crowns -= cost;
  return { problem: null, report: endSiege(state, rng, day, 'bought off') };
}

type SiegeEnd = 'lifted' | 'yielded' | 'bought off';

function endSiege(state: SimState, rng: Rng, day: number, how: SiegeEnd): BattleReport {
  const s = state.defence.siege as SiegeState;
  const e = state.economy;
  const cfg = SIEGE.blockade;
  const days = day - s.day;
  let plunder: BattleReport['plunder'] = null;
  let headline: string;
  const lines: ReportLine[] = [];
  if (how === 'yielded') {
    const crowns = Math.round(e.stores.crowns * cfg.yieldCrowns);
    e.stores.crowns -= crowns;
    e.standing = Math.max(0, e.standing - cfg.yieldStanding);
    plunder = { crowns, food: 0 };
    headline = `The castle yielded after a ${days}-day siege: the raiders took ${crowns} crowns and left.`;
    lines.push({ text: `Your stores stood empty for ${cfg.starveDays} days, so you had to yield. They took ${crowns} crowns. Standing −${cfg.yieldStanding}.`, cls: 'bad' });
  } else if (how === 'bought off') {
    const paid = bribeCost(s);
    e.standing = Math.max(0, e.standing - cfg.bribeStanding);
    headline = `You paid the besiegers ${paid} crowns to go, after ${days} days.`;
    lines.push({ text: `Paid ${paid} crowns (${cfg.bribePerRaider} for each of the ${s.raiders} still in the camp). Standing −${cfg.bribeStanding}: people don't like seeing raiders paid.`, cls: 'warn' });
  } else {
    e.standing = Math.min(100, e.standing + cfg.liftedStanding);
    headline = `The siege is lifted: after ${days} days the raiders gave up and went home.`;
    lines.push({
      text: s.supplies === 0 ? `They ran out of food${s.raiders < s.start ? ', and your archers thinned their camp' : ''}, and lost heart. Standing +${cfg.liftedStanding}.` : `Your archers picked off so many that the rest lost heart. Standing +${cfg.liftedStanding}.`,
      cls: 'good',
    });
  }
  lines.push({ text: `${s.start} raiders camped to the ${s.from}; ${s.start - s.raiders} were picked off by your archers over the ${days} days.` });
  lines.push({ text: `Your stores went from ${s.foodAtStart} rations to ${Math.round(e.stores.food)}. Nothing could be bought or brought in while they sat outside.`, cls: 'dim' });
  if (how !== 'lifted')
    lines.push({ text: `They brought ${siegeSupplies(s.raid)} days of food and had ${s.supplies} left. Laying in food when scouts report a siege train, or keeping fewer mouths to feed, lets you outlast them.`, cls: 'dim' });

  const report: BattleReport = {
    raid: s.raid,
    day,
    seconds: 0,
    outcome: how === 'yielded' ? 'plundered' : how === 'lifted' ? 'repelled' : 'held',
    headline,
    attackers: { came: s.start, killed: s.start - s.raiders },
    defenders: { fought: 0, lost: 0 },
    breaches: [],
    gaps: 0,
    plunder,
    repairs: 0,
    sections: [{ title: 'The siege', lines }],
  };
  state.defence.siege = null;
  addReport(state.defence, report);
  scheduleRaid(state.defence, rng, day);
  return report;
}
