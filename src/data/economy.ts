/** Calendar, workers, wages, prices and income. Starting values to tune in playtesting. */

export const CALENDAR = {
  /** Sim ticks in one game day (30 ticks a second, so a day lasts one second at 1×). */
  ticksPerDay: 30,
  daysPerMonth: 30,
  /** The year starts in spring, when building can begin. */
  months: ['March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December', 'January', 'February'],
  /** Season of each month, in the same order. */
  seasons: ['spring', 'spring', 'spring', 'summer', 'summer', 'summer', 'autumn', 'autumn', 'autumn', 'winter', 'winter', 'winter'],
} as const;

export type Season = (typeof CALENDAR.seasons)[number];

export const SEASON_NAME: Record<Season, string> = {
  spring: 'Spring',
  summer: 'Summer',
  autumn: 'Autumn',
  winter: 'Winter',
};

/** Kinds of building work. Each job needs some of each; each worker type does some of them. */
export type Trade = 'masonry' | 'carpentry' | 'digging' | 'hauling';
export const TRADES: readonly Trade[] = ['masonry', 'carpentry', 'digging', 'hauling'];

export type WorkerType = 'labourer' | 'digger' | 'carter' | 'quarryman' | 'mason' | 'carpenter';
export const WORKER_TYPES: readonly WorkerType[] = ['labourer', 'digger', 'carter', 'quarryman', 'mason', 'carpenter'];

export interface WorkerKind {
  name: string;
  plural: string;
  /** Crowns per day at fair wages. */
  wage: number;
  /** Worker-days of each trade one worker does in a day at full efficiency. */
  rates: Partial<Record<Trade, number>>;
  /** Stone quarried per day (quarrymen only). */
  stonePerDay: number;
  /** Expected new arrivals per day while you want more, at fair wages and good standing. */
  hireRate: number;
  /** Shown in the workers panel. */
  note: string;
}

export const WORKERS: Record<WorkerType, WorkerKind> = {
  labourer: {
    name: 'Labourer',
    plural: 'Labourers',
    wage: 1,
    rates: { digging: 0.6, hauling: 0.6 },
    stonePerDay: 0,
    hireRate: 1.2,
    note: 'Cheap, quick to hire. Helps with digging and hauling, more slowly than the trades.',
  },
  digger: {
    name: 'Digger',
    plural: 'Diggers',
    wage: 2,
    rates: { digging: 1 },
    stonePerDay: 0,
    hireRate: 0.6,
    note: 'Earthworks, and footings for every piece.',
  },
  carter: {
    name: 'Carter',
    plural: 'Carters',
    wage: 3,
    rates: { hauling: 2 },
    stonePerDay: 0,
    hireRate: 0.4,
    note: 'Comes with a cart: hauls stone, timber and spoil twice as fast as a labourer carries.',
  },
  quarryman: {
    name: 'Quarryman',
    plural: 'Quarrymen',
    wage: 2,
    rates: {},
    stonePerDay: 1,
    hireRate: 0.5,
    note: 'Cuts stone for the store all year except winter. Much cheaper than buying it.',
  },
  mason: {
    name: 'Mason',
    plural: 'Masons',
    wage: 3,
    rates: { masonry: 1 },
    stonePerDay: 0,
    hireRate: 0.35,
    note: 'Lays the stone. Every wall, tower, gatehouse and keep needs masons.',
  },
  carpenter: {
    name: 'Carpenter',
    plural: 'Carpenters',
    wage: 2,
    rates: { carpentry: 1 },
    stonePerDay: 0,
    hireRate: 0.4,
    note: 'Scaffolding, floors, roofs, gates and piling.',
  },
};

export type WageLevel = 'low' | 'fair' | 'generous';
export const WAGE_LEVELS: Record<WageLevel, { name: string; pay: number; hiring: number; efficiency: number }> = {
  low: { name: 'Low', pay: 0.75, hiring: 0.4, efficiency: 0.8 },
  fair: { name: 'Fair', pay: 1, hiring: 1, efficiency: 1 },
  generous: { name: 'Generous', pay: 1.3, hiring: 1.6, efficiency: 1.1 },
};

/** Share of a piece's labour that goes to each trade. Earthworks use the two `earth` mixes. */
export const JOB_MIX: Record<'wall' | 'tower' | 'gatehouse' | 'keep' | 'lower' | 'raise', Partial<Record<Trade, number>>> = {
  wall: { masonry: 0.5, carpentry: 0.1, digging: 0.1, hauling: 0.3 },
  tower: { masonry: 0.5, carpentry: 0.15, digging: 0.05, hauling: 0.3 },
  gatehouse: { masonry: 0.45, carpentry: 0.25, digging: 0.05, hauling: 0.25 },
  keep: { masonry: 0.45, carpentry: 0.25, digging: 0.05, hauling: 0.25 },
  lower: { digging: 0.6, hauling: 0.4 },
  raise: { digging: 0.3, hauling: 0.7 },
};

/** Most workers that fit on one job at once. More than this just get in each other's way. */
export const CREW_LIMIT: Record<'wall' | 'tower' | 'gatehouse' | 'keep' | 'earth', number> = {
  wall: 5,
  tower: 7,
  gatehouse: 9,
  keep: 14,
  earth: 4,
};

export const ECONOMY = {
  start: { crowns: 8000, stone: 150, timber: 80, food: 600, spoil: 0, standing: 70 },
  /** Rations eaten per worker per day. */
  rationsPerWorker: 1,
  /** Warn when the food store will last fewer days than this. */
  lowFoodDays: 10,
  /** In winter nothing is built; workers are kept on at this share of their wage. */
  winterPay: 0.5,
  /** Efficiency when the stores run out of food, or wages go unpaid. */
  hungryEfficiency: 0.5,
  unpaidEfficiency: 0.5,
  /** Chance per worker per day of walking off while hungry or unpaid. */
  quitChance: 0.08,
  /**
   * Taxes on the first day of spring (not the very first spring): (base + bonus for the castle built) × standing.
   * The bonus grows with the worker-days of finished pieces, up to the full amount at `taxFullCastle`
   * (about a modest walled castle), so it rewards building, not planning small.
   */
  taxBase: 7000,
  taxPerCompletion: 5000,
  taxFullCastle: 3000,
  /** Harvest dues paid in food on the first day of autumn: base × standing. */
  harvestFood: 2500,
  /** A levy on the first of the month brings in crowns but costs standing. */
  levy: 600,
  levyStanding: 6,
  /** Standing recovers this much each month without a levy (out of 100). */
  standingRecovery: 2,
  /** Market prices, in crowns each. Fill is spoil carted in from elsewhere. */
  prices: { stone: 4, timber: 2, food: 0.25, fill: 3 },
  /** How much one click of a buy button gets. */
  lots: { stone: 50, timber: 50, food: 200, fill: 20 },
  /** Days between report samples, and how many samples to keep. */
  sampleDays: 5,
  maxSamples: 720,
};

/** Plain words for each trade, and who does it (for "short on ..." notes). */
export const TRADE_NAMES: Record<Trade, { name: string; who: string }> = {
  masonry: { name: 'Masonry', who: 'masons' },
  carpentry: { name: 'Carpentry', who: 'carpenters' },
  digging: { name: 'Digging', who: 'diggers or labourers' },
  hauling: { name: 'Hauling', who: 'carters or labourers' },
};
