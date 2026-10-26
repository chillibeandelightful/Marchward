import { TROOP_TYPES, TROOPS, type TroopType } from '../data/combat';
import { ECONOMY, WAGE_LEVELS, WORKER_TYPES, WORKERS, type WageLevel, type WorkerType } from '../data/economy';
import type { Rng } from './rng';

export interface Stores {
  crowns: number;
  stone: number;
  timber: number;
  food: number;
  /** Cartloads of earth dug out and waiting to be used as fill. */
  spoil: number;
}

/** Money in and out over a month, for the reports panel. Spending is negative. */
export interface Ledger {
  taxes: number;
  levies: number;
  wages: number;
  purchases: number;
}

export interface EconomyState {
  stores: Stores;
  /** How well the people of the march think of you, 0 to 100. Affects taxes, harvest dues and hiring. */
  standing: number;
  wage: WageLevel;
  /** Raise a levy on the first of each month. */
  levy: boolean;
  workers: Record<WorkerType, number>;
  /** How many of each the player wants; hiring fills the gap over time. */
  wanted: Record<WorkerType, number>;
  /** The garrison, and how many soldiers of each kind are wanted. */
  troops: Record<TroopType, number>;
  troopsWanted: Record<TroopType, number>;
  /** Today's stores couldn't feed everyone, or pay everyone. */
  hungry: boolean;
  unpaid: boolean;
  thisMonth: Ledger;
  lastMonth: Ledger;
}

export function createEconomy(): EconomyState {
  const s = ECONOMY.start;
  const none = () => Object.fromEntries(WORKER_TYPES.map((t) => [t, 0])) as Record<WorkerType, number>;
  return {
    stores: { crowns: s.crowns, stone: s.stone, timber: s.timber, food: s.food, spoil: s.spoil },
    standing: s.standing,
    wage: 'fair',
    levy: false,
    workers: none(),
    wanted: none(),
    troops: startingTroops(),
    troopsWanted: startingTroops(),
    hungry: false,
    unpaid: false,
    thisMonth: emptyLedger(),
    lastMonth: emptyLedger(),
  };
}

export function startingTroops(): Record<TroopType, number> {
  return Object.fromEntries(TROOP_TYPES.map((t) => [t, TROOPS[t].start])) as Record<TroopType, number>;
}

/** Everyone who eats from the stores: workers and soldiers. */
export function mouths(e: EconomyState): number {
  return totalWorkers(e) + totalTroops(e);
}

export function totalTroops(e: EconomyState): number {
  return TROOP_TYPES.reduce((n, t) => n + e.troops[t], 0);
}

/** Soldiers the player pays for: everyone beyond the garrison the crown pays for. */
export function paidTroops(e: EconomyState, type: TroopType): number {
  return Math.max(0, e.troops[type] - TROOPS[type].crownPays);
}

/** Set how many soldiers of a kind you want. Fewer stands the extra down at once. */
export function setTroopsWanted(e: EconomyState, type: TroopType, n: number): void {
  e.troopsWanted[type] = Math.max(0, Math.min(60, Math.round(n)));
  e.troops[type] = Math.min(e.troops[type], e.troopsWanted[type]);
}

export function emptyLedger(): Ledger {
  return { taxes: 0, levies: 0, wages: 0, purchases: 0 };
}

export function totalWorkers(e: EconomyState): number {
  return WORKER_TYPES.reduce((n, t) => n + e.workers[t], 0);
}

export interface EfficiencyPart {
  label: string;
  factor: number;
}

/** What multiplies every worker's output today, with the reasons, for the panel. */
export function efficiencyParts(e: EconomyState): EfficiencyPart[] {
  const parts: EfficiencyPart[] = [{ label: `${WAGE_LEVELS[e.wage].name} wages`, factor: WAGE_LEVELS[e.wage].efficiency }];
  if (e.hungry) parts.push({ label: 'No food in the stores', factor: ECONOMY.hungryEfficiency });
  if (e.unpaid) parts.push({ label: 'Wages unpaid', factor: ECONOMY.unpaidEfficiency });
  return parts;
}

export function efficiency(e: EconomyState): number {
  return efficiencyParts(e).reduce((f, p) => f * p.factor, 1);
}

/** Crowns per day for the current workforce. */
export function dailyWages(e: EconomyState, winter: boolean): number {
  const pay = WAGE_LEVELS[e.wage].pay * (winter ? ECONOMY.winterPay : 1);
  const workers = WORKER_TYPES.reduce((sum, t) => sum + e.workers[t] * WORKERS[t].wage * pay, 0);
  // Soldiers are paid in full all year: raiders don't wait for spring to be watched for.
  const troops = TROOP_TYPES.reduce((sum, t) => sum + paidTroops(e, t) * TROOPS[t].wage * WAGE_LEVELS[e.wage].pay, 0);
  return workers + troops;
}

/** Expected arrivals per day for a worker type while more are wanted. */
export function hireRate(e: EconomyState, type: WorkerType, winter: boolean): number {
  return WORKERS[type].hireRate * WAGE_LEVELS[e.wage].hiring * (0.5 + e.standing / 100) * (winter ? 0.5 : 1);
}

/** Set how many of a worker type you want. Asking for fewer dismisses the extra at once. */
export function setWanted(e: EconomyState, type: WorkerType, n: number): void {
  e.wanted[type] = Math.max(0, Math.min(99, Math.round(n)));
  e.workers[type] = Math.min(e.workers[type], e.wanted[type]);
}

/** New workers arrive over time, while fewer are on site than wanted. Nobody comes while wages or food run short. */
export function hire(e: EconomyState, rng: Rng, winter: boolean): void {
  if (e.hungry || e.unpaid) return;
  for (const t of WORKER_TYPES) {
    const short = e.wanted[t] - e.workers[t];
    if (short <= 0) continue;
    const expected = hireRate(e, t, winter);
    const arrivals = Math.floor(expected) + (rng.next() < expected % 1 ? 1 : 0);
    e.workers[t] += Math.min(short, arrivals);
  }
  for (const t of TROOP_TYPES) {
    const short = e.troopsWanted[t] - e.troops[t];
    if (short <= 0) continue;
    const expected = TROOPS[t].hireRate * WAGE_LEVELS[e.wage].hiring * (0.5 + e.standing / 100);
    const arrivals = Math.floor(expected) + (rng.next() < expected % 1 ? 1 : 0);
    e.troops[t] += Math.min(short, arrivals);
  }
}

/** Pay wages and feed everyone for a day; anyone hungry or unpaid may walk off. Returns how many left. */
export function payAndFeed(e: EconomyState, rng: Rng, winter: boolean): number {
  const wages = dailyWages(e, winter);
  e.unpaid = e.stores.crowns < wages;
  const paid = Math.min(wages, e.stores.crowns);
  e.stores.crowns -= paid;
  e.thisMonth.wages -= paid;

  const eat = mouths(e) * ECONOMY.rationsPerWorker;
  e.hungry = e.stores.food < eat;
  e.stores.food = Math.max(0, e.stores.food - eat);

  let left = 0;
  if (e.hungry || e.unpaid)
    for (const t of WORKER_TYPES) {
      let quit = 0;
      for (let i = 0; i < e.workers[t]; i++) if (rng.next() < ECONOMY.quitChance) quit++;
      e.workers[t] -= quit;
      left += quit;
    }
  // Unpaid or hungry soldiers desert too, but they don't count as workers walking off.
  if (e.hungry || e.unpaid)
    for (const t of TROOP_TYPES) {
      let quit = 0;
      for (let i = 0; i < paidTroops(e, t); i++) if (rng.next() < ECONOMY.quitChance) quit++;
      e.troops[t] -= quit;
    }
  return left;
}

export type Purchase = 'stone' | 'timber' | 'food' | 'fill';

export function purchasePrice(item: Purchase): number {
  return ECONOMY.lots[item] * ECONOMY.prices[item];
}

/** Buy one lot of something. Returns a problem, or null if bought. */
export function buy(e: EconomyState, item: Purchase): string | null {
  const price = purchasePrice(item);
  if (e.stores.crowns < price) return `Not enough crowns (needs ${price})`;
  e.stores.crowns -= price;
  e.thisMonth.purchases -= price;
  if (item === 'fill') e.stores.spoil += ECONOMY.lots.fill;
  else e.stores[item] += ECONOMY.lots[item];
  return null;
}

/** First of the month: the levy (if raised) or standing recovers, and the ledger rolls over. */
export function newMonth(e: EconomyState): number {
  e.lastMonth = e.thisMonth;
  e.thisMonth = emptyLedger();
  if (!e.levy) {
    e.standing = Math.min(100, e.standing + ECONOMY.standingRecovery);
    return 0;
  }
  e.stores.crowns += ECONOMY.levy;
  e.thisMonth.levies += ECONOMY.levy;
  e.standing = Math.max(0, e.standing - ECONOMY.levyStanding);
  return ECONOMY.levy;
}

/** Spring taxes, rising with standing and with the worker-days of castle pieces finished. */
export function taxDue(e: EconomyState, builtLabour: number): number {
  const castle = Math.min(1, builtLabour / ECONOMY.taxFullCastle);
  return Math.round((ECONOMY.taxBase + ECONOMY.taxPerCompletion * castle) * (e.standing / 100));
}

export function collectTaxes(e: EconomyState, builtLabour: number): number {
  const due = taxDue(e, builtLabour);
  e.stores.crowns += due;
  e.thisMonth.taxes += due;
  return due;
}

export function harvestDue(e: EconomyState): number {
  return Math.round(ECONOMY.harvestFood * (e.standing / 100));
}

export function collectHarvest(e: EconomyState): number {
  const due = harvestDue(e);
  e.stores.food += due;
  return due;
}
