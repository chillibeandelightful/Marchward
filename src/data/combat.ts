/** Troops, raiders, castle extras and raid timing. Starting values to tune in playtesting. */
import type { Cost } from './castle';

export type TroopType = 'swordsman' | 'archer';
export const TROOP_TYPES: readonly TroopType[] = ['swordsman', 'archer'];

export type RaiderType = 'raider' | 'raiderArcher';
export const RAIDER_TYPES: readonly RaiderType[] = ['raider', 'raiderArcher'];

export type UnitType = TroopType | RaiderType;
export type Side = 'defender' | 'attacker';

export interface UnitKind {
  name: string;
  plural: string;
  side: Side;
  hp: number;
  /** Tiles a second on open, level grass. */
  speed: number;
  /** Damage per blow and seconds between blows. */
  melee: { damage: number; cooldown: number };
  /** Damage per arrow, seconds between shots, and the chance to hit an unprotected target. */
  bow: { damage: number; cooldown: number; hit: number } | null;
  /** Wall HP knocked off a second while battering. */
  batter: number;
}

export const UNITS: Record<UnitType, UnitKind> = {
  swordsman: {
    name: 'Swordsman',
    plural: 'Swordsmen',
    side: 'defender',
    hp: 65,
    speed: 1.3,
    melee: { damage: 10, cooldown: 1 },
    bow: null,
    batter: 0,
  },
  archer: {
    name: 'Archer',
    plural: 'Archers',
    side: 'defender',
    hp: 35,
    speed: 1.2,
    melee: { damage: 3, cooldown: 1.2 },
    bow: { damage: 12, cooldown: 2.2, hit: 0.65 },
    batter: 0,
  },
  raider: {
    name: 'Raider',
    plural: 'Raiders',
    side: 'attacker',
    hp: 50,
    speed: 1.2,
    melee: { damage: 8, cooldown: 1 },
    bow: null,
    batter: 1,
  },
  raiderArcher: {
    name: 'Raider archer',
    plural: 'Raider archers',
    side: 'attacker',
    hp: 35,
    speed: 1.1,
    melee: { damage: 3, cooldown: 1.2 },
    bow: { damage: 10, cooldown: 2.4, hit: 0.6 },
    batter: 0,
  },
};

/** Hiring soldiers. The crown pays for a small garrison; soldiers beyond that are paid like workers. */
export const TROOPS: Record<TroopType, { wage: number; hireRate: number; crownPays: number; start: number; note: string }> = {
  swordsman: {
    wage: 3,
    hireRate: 0.4,
    crownPays: 3,
    start: 3,
    note: 'Guards a spot on the ground and fights raiders who come near it. Opens the gate to get out.',
  },
  archer: {
    wage: 3,
    hireRate: 0.4,
    crownPays: 4,
    start: 4,
    note: 'Shoots from a wall or tower (or the ground). Range grows with height; battlements and arrow slits protect them.',
  },
};

export const COMBAT = {
  /** Bow range in tiles on level ground; height above the target adds RANGE_BONUS. */
  bowRange: 5,
  /** Melee reach in tiles. */
  meleeReach: 0.9,
  /** Swordsmen go after raiders this far from their post, and raiders turn on defenders this close. */
  guardRadius: 4,
  raiderAggro: 2.5,
  /** Share of hits turned aside for an archer standing on a piece. */
  cover: { slits: 0.7, battlements: 0.4, unfinished: 0.1 },
  /** Hit chance lost for each level the target stands above the shooter. */
  upwardPenalty: 0.1,
  /** Share of hits turned aside by trees for a target standing in forest. */
  forestCover: 0.4,
  /** A piece stands in the way (and can hold archers) once it is this far built. Less is just footings. */
  standingAt: 0.5,
  /** Archers that fit on a piece, and soldiers on one ground tile. */
  postCapacity: { wall: 2, tower: 4, gatehouse: 4, keep: 6, ground: 4 },
  cauldron: { uses: 3, damage: 35, radius: 1.4, cooldown: 8 },
  /** Raiders weigh a route through a piece as this many tiles of walking per HP it has left. */
  batterCostPerHp: 0.1,
  /** Footings of an unfinished piece, and the rubble of a breached one, are rough going. */
  rubbleCost: 1.5,
  /** Each level climbed costs this much more, on top of the ground's own cost. */
  climbCost: 0.5,
  /** Raider-seconds spent at the target before it is plundered. */
  plunderNeeded: 40,
  /** Archers on the walls move along them towards raiders up to this many tiles beyond their reach. */
  wallWalk: 4,
  /** Raiders that can batter one piece at once. */
  batterersPerPiece: 4,
  plunder: { crowns: 0.2, food: 0.3, standing: 8 },
  repelledStanding: 3,
  /** The raiders break and flee once they have lost this share of their number. */
  breakAt: 0.65,
  /** They give up and leave after this long. */
  maxSeconds: 180,
  /** Anyone still on the field this long after the retreat starts has got away. */
  fleeSeconds: 40,
  /** A breached piece is left this far built (footings and rubble) and has to be rebuilt. */
  breachedProgress: 0.2,
  arrowSpeed: 14,
};

export type ExtraId = 'slits' | 'cauldron';

/** Extras for walls, towers and the gatehouse, added with the Extras tool. Costs are per piece. */
export const EXTRAS: Record<ExtraId, { name: string; cost: Cost; note: string }> = {
  slits: {
    name: 'Arrow slits',
    cost: { stone: 4, timber: 0, labour: 12 },
    note: `Archers here are hit ${Math.round(COMBAT.cover.slits * 100)}% less often (battlements alone: ${Math.round(COMBAT.cover.battlements * 100)}%)`,
  },
  cauldron: {
    name: 'Oil cauldron',
    cost: { stone: 2, timber: 8, labour: 15 },
    note: `Needs an archer posted here. Scalds raiders at the foot of the wall: ${COMBAT.cauldron.uses} pours a battle, ${COMBAT.cauldron.damage} damage each`,
  },
};

export const RAIDS = {
  /** Day of the first raid (day 0 is 1 March, year 1), plus up to `firstJitter` days. */
  firstDay: 100,
  firstJitter: 20,
  /** Scouts bring word this many days ahead. */
  warningDays: 10,
  /** Days between raids. Raids never come in winter. */
  gap: [100, 150] as const,
  /** Raid n (from 1) brings base + perRaid × (n − 1) of each. */
  strength: {
    raider: { base: 4, perRaid: 3 },
    raiderArcher: { base: 1, perRaid: 1 },
  } satisfies Record<RaiderType, { base: number; perRaid: number }>,
};
