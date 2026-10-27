import { WALL_THICKNESS } from '../data/castle';
import { COMBAT, RAIDER_TYPES, TROOP_TYPES, UNITS, type RaiderType, type Side, type TroopType, type UnitType } from '../data/combat';
import { simConfig } from '../data/config';
import { TRADES } from '../data/economy';
import { batterTaken, footprint, gateEnds, hasSlits, pieceCost, pieceHp, pieceLevels, pieceName, rangeBonus, type Piece, type PieceKind } from './castle';
import { EDGES, describeStrength, raidStrength, type Edge } from './defence';
import { distanceField, downhill, findPath, landCost, type StepCost } from './path';
import { Rng } from './rng';
import { walkLine } from './site';
import type { SimState } from './state';
import { heightAt, inBounds, NEIGHBOURS, terrainAt, type TerrainMap } from './terrain';
import { pieceProgress } from './works';

const DT = 1 / simConfig.ticksPerSecond;

/** One soldier or raider on the field. Positions are in tile coordinates. */
export interface Unit {
  id: number;
  type: UnitType;
  side: Side;
  x: number;
  y: number;
  hp: number;
  /** Seconds until the next blow or shot. */
  cooldown: number;
  /** Id of the piece an archer stands on; 0 on the ground. */
  on: number;
  /** Defenders: the tile they guard (-1 for none). */
  post: number;
  /** Defenders walking back to their post: tiles still to walk. */
  path: number[];
  /** Ticks before trying again to find a way back. */
  retry: number;
  /** Where in a tile it stands, so a crowd doesn't stand on one spot. */
  ox: number;
  oy: number;
  /** What it did this tick, for drawing. */
  act: 'stand' | 'walk' | 'fight' | 'batter' | 'shoot' | 'loot';
  /** Piece it was posted on at the start (0 for the ground), for the report. */
  postedOn: number;
}

/** A castle piece as it stands in battle. */
export interface PieceCombat {
  id: number;
  name: string;
  kind: PieceKind;
  x: number;
  y: number;
  /** Tile indices it covers. */
  tiles: number[];
  /** Share built when the battle started. */
  progress: number;
  complete: boolean;
  /** Full strength of the finished piece, and what it had at the start (less if unfinished). */
  full: number;
  max: number;
  hp: number;
  /** Ground level and how many levels it stands (less if unfinished). */
  ground: number;
  levels: number;
  /** Stands in the way and holds archers. Unfinished footings and breached rubble don't. */
  standing: boolean;
  slits: boolean;
  cauldron: boolean;
  oilLeft: number;
  oilWait: number;
  batterTaken: number;
  /** Seconds into the battle it fell, and how many of your archers could reach its foot then. */
  breachedAt: number | null;
  coveredBy: number;
  /** Seconds into the battle the raiders first struck it (missing in saves from before it was kept). */
  batterFrom?: number | null;
}

/** An arrow in flight. Whether it hits is decided as it is loosed; the damage lands when it arrives. */
export interface Arrow {
  shooter: number;
  /** Piece the shooter stood on (0 for none), so kills count for the post. */
  from: number;
  side: Side;
  target: number;
  x0: number;
  y0: number;
  l0: number;
  x1: number;
  y1: number;
  l1: number;
  fired: number;
  arrive: number;
  damage: number;
  hit: boolean;
}

export interface Splash {
  x: number;
  y: number;
  tick: number;
}

export interface BattleStats {
  start: Record<UnitType, number>;
  lost: Record<UnitType, number>;
  /** Arrows that would have hit your archers but for cover. */
  saved: { slits: number; battlements: number };
  /** Tiles of unfinished pieces raiders walked across. */
  gaps: number[];
  /** By piece id. */
  oilKills: Record<string, number>;
  oilUses: Record<string, number>;
  /** Kills by archers, by the piece they were posted on ('0' for the ground). */
  postKills: Record<string, number>;
  /** Pieces that had an archer on them at the start. */
  manned: number[];
  /** Raiders who got away. */
  escaped: number;
  plundered: { crowns: number; food: number } | null;
}

/** A raid being fought. Plain data, so a battle can be saved and carried on. */
export interface BattleState {
  tick: number;
  raid: number;
  from: Edge;
  target: 'keep' | 'camp';
  targetTiles: number[];
  units: Unit[];
  nextId: number;
  pieces: Record<string, PieceCombat>;
  arrows: Arrow[];
  splashes: Splash[];
  /** Raider-seconds spent at the target. */
  plunder: number;
  phase: 'fight' | 'retreat';
  retreatTick: number;
  why: 'broke' | 'plundered' | 'gave up' | 'no way' | null;
  /** Bumped whenever a piece falls, so routes are worked out again. */
  version: number;
  /**
   * The piece the raiders have picked to batter through (0 for none), the tile they gather on in
   * front of it, and the version it was picked for. They mass at one spot rather than each hitting
   * the bit of wall in front of them.
   */
  rally: number;
  front: number;
  rallyVersion: number;
  stats: BattleStats;
}

export type Outcome = 'repelled' | 'plundered' | 'held';

export interface ReportLine {
  text: string;
  cls?: 'good' | 'bad' | 'warn' | 'dim';
}

/** What happened in a battle, in plain words, with the numbers tests and panels need. */
export interface BattleReport {
  raid: number;
  day: number;
  seconds: number;
  outcome: Outcome;
  headline: string;
  attackers: { came: number; killed: number };
  defenders: { fought: number; lost: number };
  breaches: { id: number; name: string; x: number; y: number; seconds: number }[];
  gaps: number;
  plunder: { crowns: number; food: number } | null;
  repairs: number;
  sections: { title: string; lines: ReportLine[] }[];
}

// ---------------------------------------------------------------------------------------------
// Things worked out from the battle state and kept between ticks (not saved: rebuilt after a load).

interface Derived {
  version: number;
  /** Piece id per tile; 0 for none. */
  occupant: Int32Array;
  /** Route-finding costs for raiders, which count battering through a piece as so much walking. */
  attackCost: StepCost;
  /** Where raiders can actually walk now: not into standing pieces. */
  attackWalk: StepCost;
  defendCost: StepCost;
  attack: Float64Array;
  flee: Float64Array;
  /** Towards the front of the rally piece, for the tile it was worked out for. */
  rallyField: Float64Array | null;
  rallyFront: number;
}

const derived = new WeakMap<BattleState, Derived>();

function derive(map: TerrainMap, b: BattleState): Derived {
  const old = derived.get(b);
  if (old && old.version === b.version) {
    if (old.rallyFront !== b.front) {
      old.rallyFront = b.front;
      old.rallyField = b.front >= 0 ? distanceField(map, [b.front], old.attackWalk) : null;
    }
    return old;
  }
  const occupant = old?.occupant ?? occupancy(map, b);
  const at = (i: number) => b.pieces[occupant[i] as number];
  const attackCost: StepCost = (i, j) => {
    const land = landCost(map, i, j);
    if (land === null) return null;
    const p = at(j);
    if (!p) return land;
    if (!p.standing) return land * COMBAT.rubbleCost;
    if (p.kind === 'keep') return null;
    return land + (COMBAT.batterCostPerHp * p.hp) / p.batterTaken;
  };
  const attackWalk: StepCost = (i, j) => (at(j)?.standing ? null : attackCost(i, j));
  const defendCost: StepCost = (i, j) => {
    const land = landCost(map, i, j);
    if (land === null) return null;
    const p = at(j);
    if (!p) return land;
    if (!p.standing) return land * COMBAT.rubbleCost;
    return p.kind === 'gatehouse' ? land : null;
  };
  const d: Derived = {
    version: b.version,
    occupant,
    attackCost,
    attackWalk,
    defendCost,
    attack: distanceField(map, b.targetTiles, attackCost),
    flee: distanceField(map, edgeTiles(map), attackCost),
    rallyField: b.front >= 0 ? distanceField(map, [b.front], attackWalk) : null,
    rallyFront: b.front,
  };
  derived.set(b, d);
  return d;
}

function occupancy(map: TerrainMap, b: BattleState): Int32Array {
  const occ = new Int32Array(map.width * map.height);
  for (const p of Object.values(b.pieces)) for (const t of p.tiles) occ[t] = p.id;
  return occ;
}

function edgeTiles(map: TerrainMap, edge?: Edge): number[] {
  const out: number[] = [];
  for (let y = 0; y < map.height; y++)
    for (let x = 0; x < map.width; x++) {
      const on =
        edge === undefined
          ? x === 0 || y === 0 || x === map.width - 1 || y === map.height - 1
          : (edge === 'north-west' && x === 0) ||
            (edge === 'north-east' && y === 0) ||
            (edge === 'south-east' && x === map.width - 1) ||
            (edge === 'south-west' && y === map.height - 1);
      if (on && terrainAt(map, x, y).moveCost !== null) out.push(y * map.width + x);
    }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Starting a battle.

function zeroUnits(): Record<UnitType, number> {
  return { swordsman: 0, archer: 0, raider: 0, raiderArcher: 0 };
}

/** The pieces as they stand today: unfinished ones have part of their strength and height. */
function combatPieces(s: SimState): Record<string, PieceCombat> {
  const out: Record<string, PieceCombat> = {};
  for (const p of s.plan.pieces) {
    const progress = pieceProgress(s.map, s.works, p);
    const complete = progress >= 1;
    const full = pieceHp(p);
    const standing = progress >= COMBAT.standingAt;
    const levels = pieceLevels(p);
    const max = standing ? Math.round(full * Math.min(1, progress)) : 0;
    out[p.id] = {
      id: p.id,
      name: pieceName(p),
      kind: p.kind,
      x: p.x,
      y: p.y,
      tiles: footprint(p).filter(([x, y]) => inBounds(s.map, x, y)).map(([x, y]) => y * s.map.width + x),
      progress,
      complete,
      full,
      max,
      hp: max,
      ground: Math.max(...footprint(p).map(([x, y]) => heightAt(s.map, x, y))),
      levels: complete ? levels : Math.max(1, Math.round(levels * progress)),
      standing,
      slits: hasSlits(p),
      cauldron: !!p.cauldron,
      oilLeft: complete && p.cauldron ? COMBAT.cauldron.uses : 0,
      oilWait: 0,
      batterTaken: batterTaken(p),
      breachedAt: null,
      batterFrom: null,
      coveredBy: 0,
    };
  }
  return out;
}

/** What the raiders make for: the keep if it stands, otherwise the camp and its stores. */
function chooseTarget(s: SimState, pieces: Record<string, PieceCombat>): { target: 'keep' | 'camp'; tiles: number[] } {
  const { map } = s;
  const keep = s.plan.pieces.find((p) => p.kind === 'keep');
  const tiles = new Set<number>();
  const walkable = (x: number, y: number) =>
    inBounds(map, x, y) && terrainAt(map, x, y).moveCost !== null && !s.plan.pieces.some((p) => pieces[p.id]?.standing && footprint(p).some(([px, py]) => px === x && py === y));
  if (keep && pieces[keep.id]?.standing) {
    const own = footprint(keep);
    for (const [x, y] of own)
      for (const [dx, dy] of NEIGHBOURS) {
        const nx = x + dx;
        const ny = y + dy;
        if (own.some(([ox, oy]) => ox === nx && oy === ny) || !walkable(nx, ny)) continue;
        tiles.add(ny * map.width + nx);
      }
    if (tiles.size > 0) return { target: 'keep', tiles: [...tiles] };
  }
  const [cx, cy] = s.camp;
  for (const [dx, dy] of [[0, 0], ...NEIGHBOURS] as const) if (walkable(cx + dx, cy + dy)) tiles.add((cy + dy) * map.width + cx + dx);
  return { target: 'camp', tiles: [...tiles] };
}

function newUnit(b: BattleState, rng: Rng, type: UnitType, x: number, y: number, on = 0, post = -1): Unit {
  const u: Unit = {
    id: b.nextId++,
    type,
    side: UNITS[type].side,
    x,
    y,
    hp: UNITS[type].hp,
    cooldown: rng.next() * 1.5,
    on,
    post,
    path: [],
    retry: 0,
    ox: (rng.next() - 0.5) * 0.5,
    oy: (rng.next() - 0.5) * 0.5,
    act: 'stand',
    postedOn: on,
  };
  if (on === 0) {
    u.x += u.ox;
    u.y += u.oy;
  }
  b.units.push(u);
  return u;
}

/** Start the raid that is due: the raiders arrive at one edge and the garrison takes its posts. */
export function startBattle(s: SimState, rng: Rng): BattleState {
  const { map } = s;
  const d = s.defence;
  d.raidCount++;
  const pieces = combatPieces(s);
  const { target, tiles } = chooseTarget(s, pieces);
  const b: BattleState = {
    tick: 0,
    raid: d.raidCount,
    from: d.from,
    target,
    targetTiles: tiles,
    units: [],
    nextId: 1,
    pieces,
    arrows: [],
    splashes: [],
    plunder: 0,
    phase: 'fight',
    retreatTick: 0,
    why: null,
    version: 0,
    rally: 0,
    front: -1,
    rallyVersion: -1,
    stats: {
      start: zeroUnits(),
      lost: zeroUnits(),
      saved: { slits: 0, battlements: 0 },
      gaps: [],
      oilKills: {},
      oilUses: {},
      postKills: {},
      manned: [],
      escaped: 0,
      plundered: null,
    },
  };
  const der = derive(map, b);

  // The raiders gather at their edge: the reachable tiles nearest a spot picked at random.
  const order = [d.from, ...EDGES.filter((e) => e !== d.from)];
  let spawn: number[] = [];
  for (const e of order) {
    spawn = edgeTiles(map, e).filter((i) => Number.isFinite(der.attack[i]));
    if (spawn.length > 0) {
      b.from = e;
      break;
    }
  }
  if (spawn.length === 0) spawn = edgeTiles(map, d.from);
  const centre = spawn.length > 0 ? rng.pick(spawn) : 0;
  const cx = centre % map.width;
  const cy = (centre - cx) / map.width;
  const near = [...spawn].sort((a, c) => tileDist(map, a, cx, cy) - tileDist(map, c, cx, cy) || a - c).slice(0, 8);
  const strength = raidStrength(b.raid);
  let k = 0;
  for (const t of RAIDER_TYPES)
    for (let i = 0; i < strength[t]; i++, k++) {
      const tile = near[k % Math.max(1, near.length)] ?? centre;
      newUnit(b, rng, t, tile % map.width, Math.floor(tile / map.width));
      b.stats.start[t]++;
    }
  if (!near.some((i) => Number.isFinite(der.attack[i]))) {
    b.phase = 'retreat';
    b.why = 'no way';
  }

  placeDefenders(s, b, rng, der, cx, cy);
  b.stats.manned = [...new Set(b.units.filter((u) => u.on).map((u) => u.on))];
  s.works.crew = {};
  s.works.idle = { ...s.economy.workers };
  return b;
}

/** True while the raiders have arrived but the fighting hasn't begun: troops can still be posted. */
export function deploying(b: BattleState): boolean {
  return b.tick === 0;
}

/**
 * Before the first blow, put the garrison out again from the current posts (after the player
 * changes them). Raiders stay where they are; does nothing once the fight has started.
 */
export function redeploy(s: SimState): boolean {
  const b = s.defence.battle;
  if (!b || !deploying(b)) return false;
  const { map } = s;
  const rng = new Rng(s.rngState);
  const raiders = b.units.filter((u) => u.side !== 'defender');
  b.units = raiders;
  for (const t of TROOP_TYPES) b.stats.start[t] = 0;
  const der = derive(map, b);
  // Place against where the raiders gathered, as at the start.
  const n = Math.max(1, raiders.length);
  const ex = Math.round(raiders.reduce((a, u) => a + u.x, 0) / n);
  const ey = Math.round(raiders.reduce((a, u) => a + u.y, 0) / n);
  placeDefenders(s, b, rng, der, ex, ey);
  b.stats.manned = [...new Set(b.units.filter((u) => u.on).map((u) => u.on))];
  s.rngState = rng.getState();
  return true;
}

/** How long a breached piece stood up to battering, from the first blow to its fall. */
function batteredFor(p: PieceCombat): number {
  return Math.round((p.breachedAt ?? 0) - (p.batterFrom ?? 0));
}

function tileDist(map: TerrainMap, i: number, x: number, y: number): number {
  const ix = i % map.width;
  const iy = (i - ix) / map.width;
  return Math.hypot(ix - x, iy - y);
}

/** Soldiers go to their posts; anyone without one is placed where they're most use. */
function placeDefenders(s: SimState, b: BattleState, rng: Rng, der: Derived, ex: number, ey: number): void {
  const { map } = s;
  const left: Record<TroopType, number> = { ...s.economy.troops };
  const onPiece = new Map<number, number>();
  const onGround = new Map<number, number>();
  const pieceAtTile = (x: number, y: number) => (inBounds(map, x, y) ? b.pieces[der.occupant[y * map.width + x] as number] : undefined);

  const place = (type: TroopType, x: number, y: number): boolean => {
    const p = pieceAtTile(x, y);
    const tile = y * map.width + x;
    if (p?.standing) {
      if (type !== 'archer' || (onPiece.get(p.id) ?? 0) >= COMBAT.postCapacity[p.kind]) return false;
      onPiece.set(p.id, (onPiece.get(p.id) ?? 0) + 1);
      newUnit(b, rng, type, x, y, p.id, tile);
    } else {
      if (!inBounds(map, x, y) || terrainAt(map, x, y).moveCost === null) return false;
      if ((onGround.get(tile) ?? 0) >= COMBAT.postCapacity.ground) return false;
      onGround.set(tile, (onGround.get(tile) ?? 0) + 1);
      newUnit(b, rng, type, x, y, 0, tile);
    }
    left[type]--;
    b.stats.start[type]++;
    return true;
  };

  for (const post of s.defence.posts) if (left[post.type] > 0) place(post.type, post.x, post.y);

  // Archers without a post go up on the pieces nearest where the raiders will strike, towers first.
  // With the way to the target open (no keep yet, say), that's where they'll strike.
  const strike = strikePoint(map, b, der, ey * map.width + ex);
  const at = strike ? b.pieces[strike.piece] : undefined;
  const goal = b.targetTiles[0] ?? 0;
  const [hx, hy] = at ? [at.x, at.y] : [goal % map.width, Math.floor(goal / map.width)];
  const perches = Object.values(b.pieces)
    .filter((p) => p.standing && Math.hypot(p.x - hx, p.y - hy) <= COMBAT.bowRange + 4)
    .map((p) => ({ p, d: Math.hypot(p.x - hx, p.y - hy) - (p.kind === 'wall' ? 0 : 1.5) }))
    .sort((a, c) => a.d - c.d || a.p.id - c.p.id);
  // One to a piece along the front, then a second round, and so on, so the line is covered.
  for (let round = 0; left.archer > 0 && round < 6; round++) for (const { p } of perches) if (left.archer > 0) place('archer', p.x, p.y);

  // Swordsmen stand round whatever the raiders are making for, then hold the inside of the gate.
  const spots: number[] = [...b.targetTiles];
  const gate = s.plan.pieces.find((p) => p.kind === 'gatehouse' && b.pieces[p.id]?.standing);
  if (gate && gate.kind === 'gatehouse') {
    const ends = gateEnds(gate)
      .filter(([x, y]) => inBounds(map, x, y))
      .map(([x, y]) => y * map.width + x)
      .sort((a, c) => (der.attack[a] as number) - (der.attack[c] as number));
    // The end further from the raiders (by their reckoning) is the inside.
    const inside = ends[ends.length - 1];
    if (inside !== undefined) spots.push(inside);
  }
  const ring = (i: number) => {
    const x = i % map.width;
    const y = (i - x) / map.width;
    return [i, ...NEIGHBOURS.map(([dx, dy]) => (inBounds(map, x + dx, y + dy) ? (y + dy) * map.width + x + dx : -1))].filter((t) => t >= 0);
  };
  // One to a tile, round and round, so they stand spread about the spot.
  const tiles = [...new Set(spots.flatMap(ring))].filter((t) => !pieceAtTile(t % map.width, Math.floor(t / map.width))?.standing);
  for (const type of ['swordsman', 'archer'] as const)
    for (let round = 0; left[type] > 0 && round < COMBAT.postCapacity.ground; round++)
      for (const t of tiles) if (left[type] > 0) place(type, t % map.width, Math.floor(t / map.width));
}

/**
 * Where raiders setting out from a tile will first come up against the castle: the piece in their
 * way and the tile in front of it. Null if their way to the target is open.
 */
function strikePoint(map: TerrainMap, b: BattleState, der: Derived, from: number): { piece: number; front: number } | null {
  let i = from;
  for (let n = 0; n < map.width * map.height; n++) {
    const next = downhill(map, der.attack, i, der.attackCost);
    if (next === null) return null;
    const p = b.pieces[der.occupant[next] as number];
    if (p?.standing) return { piece: p.id, front: i };
    i = next;
  }
  return null;
}

// ---------------------------------------------------------------------------------------------
// Fighting.

export function unitLevel(map: TerrainMap, b: BattleState, u: Unit): number {
  const p = u.on ? b.pieces[u.on] : undefined;
  if (p) return p.ground + p.levels;
  return heightAt(map, Math.round(u.x), Math.round(u.y));
}

/** How far a unit's bow reaches at a target, counting height: further shooting down, less shooting up. */
export function reach(map: TerrainMap, b: BattleState, u: Unit, target: Unit): number {
  return bowReach(unitLevel(map, b, u) - unitLevel(map, b, target));
}

/** Bow range in tiles for a shooter this many levels above (or, if negative, below) the target. */
export function bowReach(levelsAbove: number): number {
  return COMBAT.bowRange + (levelsAbove >= 0 ? rangeBonus(levelsAbove) : -rangeBonus(-levelsAbove));
}

function tileOf(map: TerrainMap, x: number, y: number): number {
  const tx = Math.max(0, Math.min(map.width - 1, Math.round(x)));
  const ty = Math.max(0, Math.min(map.height - 1, Math.round(y)));
  return ty * map.width + tx;
}

/** Can a unit walk straight from one tile to another without a wall, cliff or water in the way? */
function clearWalk(map: TerrainMap, from: number, to: number, cost: StepCost): boolean {
  let prev = from;
  let ok = true;
  walkLine([from % map.width, Math.floor(from / map.width)], [to % map.width, Math.floor(to / map.width)], (x, y) => {
    const i = y * map.width + x;
    if (!ok || i === prev) return;
    if (cost(prev, i) === null) ok = false;
    prev = i;
  });
  return ok;
}

interface TickResult {
  ended: boolean;
  /** A piece fell. */
  pieces: boolean;
}

/** Advance the battle one tick. */
export function stepBattle(s: SimState, rng: Rng): TickResult {
  const b = s.defence.battle;
  if (!b) return { ended: true, pieces: false };
  const { map } = s;
  b.tick++;
  const result: TickResult = { ended: false, pieces: false };
  let der = derive(map, b);
  const seconds = b.tick * DT;
  if (b.rallyVersion !== b.version) {
    pickRally(map, b, der);
    der = derive(map, b);
  }

  // Arrows land.
  const flying: Arrow[] = [];
  for (const a of b.arrows) {
    if (a.arrive > b.tick) {
      flying.push(a);
      continue;
    }
    const t = b.units.find((u) => u.id === a.target);
    if (!a.hit || !t || t.hp <= 0) continue;
    t.hp -= a.damage;
    if (t.hp <= 0 && a.side === 'defender') b.stats.postKills[a.from] = (b.stats.postKills[a.from] ?? 0) + 1;
  }
  b.arrows = flying;
  b.splashes = b.splashes.filter((sp) => b.tick - sp.tick < simConfig.ticksPerSecond * 1.5);

  const alive = (u: Unit) => u.hp > 0;
  const attackers = b.units.filter((u) => u.side === 'attacker' && alive(u));
  const defenders = b.units.filter((u) => u.side === 'defender' && alive(u));

  // Oil cauldrons: an archer on the piece pours when raiders are at its foot.
  for (const p of Object.values(b.pieces)) {
    if (!p.standing || p.oilLeft <= 0) continue;
    p.oilWait = Math.max(0, p.oilWait - DT);
    if (p.oilWait > 0 || !defenders.some((u) => u.on === p.id)) continue;
    const below = attackers.filter((u) => u.hp > 0 && Math.hypot(u.x - p.x, u.y - p.y) <= COMBAT.cauldron.radius);
    if (below.length === 0) continue;
    p.oilLeft--;
    p.oilWait = COMBAT.cauldron.cooldown;
    b.stats.oilUses[p.id] = (b.stats.oilUses[p.id] ?? 0) + 1;
    b.splashes.push({ x: p.x, y: p.y, tick: b.tick });
    for (const u of below) {
      const was = u.hp;
      u.hp -= COMBAT.cauldron.damage;
      if (was > 0 && u.hp <= 0) b.stats.oilKills[p.id] = (b.stats.oilKills[p.id] ?? 0) + 1;
    }
  }

  const pieceAt = (i: number) => b.pieces[der.occupant[i] as number];

  const move = (u: Unit, tx: number, ty: number, cost: StepCost): void => {
    const from = tileOf(map, u.x, u.y);
    const ahead = tileOf(map, tx, ty);
    const step = ahead === from ? 1 : (cost(from, ahead) ?? 1);
    const speed = UNITS[u.type].speed / Math.max(0.3, step);
    const dx = tx - u.x;
    const dy = ty - u.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 1e-6) return;
    const k = Math.min(1, (speed * DT) / dist);
    const nx = u.x + dx * k;
    const ny = u.y + dy * k;
    const to = tileOf(map, nx, ny);
    if (to !== from && !stepOk(map, from, to, cost)) return;
    u.x = nx;
    u.y = ny;
    u.act = 'walk';
    if (u.side === 'attacker' && to !== from) {
      const p = pieceAt(to);
      if (p && !p.standing && p.breachedAt === null && !b.stats.gaps.includes(to)) b.stats.gaps.push(to);
    }
  };

  const strike = (u: Unit, foe: Unit): void => {
    u.act = 'fight';
    if (u.cooldown > 0) return;
    foe.hp -= UNITS[u.type].melee.damage;
    u.cooldown = UNITS[u.type].melee.cooldown;
  };

  const shoot = (u: Unit, foe: Unit): void => {
    u.act = 'shoot';
    const bow = UNITS[u.type].bow;
    if (!bow || u.cooldown > 0) return;
    u.cooldown = bow.cooldown;
    const p = foe.on ? b.pieces[foe.on] : undefined;
    const cover = p ? (p.complete ? (p.slits ? COMBAT.cover.slits : COMBAT.cover.battlements) : COMBAT.cover.unfinished) : 0;
    const trees = !foe.on && terrainAt(map, Math.round(foe.x), Math.round(foe.y)).id === 'forest' ? 1 - COMBAT.forestCover : 1;
    // Shooting up is harder: each level the target stands above the shooter takes some off.
    const up = Math.max(0, unitLevel(map, b, foe) - unitLevel(map, b, u));
    const chance = bow.hit * trees * Math.max(0.4, 1 - COMBAT.upwardPenalty * up);
    const r = rng.next();
    const hit = r < chance * (1 - cover);
    if (!hit && r < chance && p) {
      if (p.complete && p.slits) b.stats.saved.slits++;
      else b.stats.saved.battlements++;
    }
    const l0 = unitLevel(map, b, u) + 0.6;
    const l1 = unitLevel(map, b, foe) + 0.5;
    const dist = Math.hypot(foe.x - u.x, foe.y - u.y);
    b.arrows.push({
      shooter: u.id,
      from: u.on,
      side: u.side,
      target: foe.id,
      x0: u.x,
      y0: u.y,
      l0,
      x1: foe.x,
      y1: foe.y,
      l1,
      fired: b.tick,
      arrive: b.tick + Math.max(1, Math.round((dist / COMBAT.arrowSpeed) * simConfig.ticksPerSecond)),
      damage: bow.damage,
      hit,
    });
  };

  const nearest = (u: Unit, foes: readonly Unit[], ok: (f: Unit, d: number) => boolean): Unit | null => {
    let best: Unit | null = null;
    let bestD = Infinity;
    for (const f of foes) {
      if (f.hp <= 0) continue;
      const d = Math.hypot(f.x - u.x, f.y - u.y);
      if (d < bestD && ok(f, d)) {
        best = f;
        bestD = d;
      }
    }
    return best;
  };

  const escaped = new Set<number>();
  const batterers = new Map<number, number>();
  for (const u of b.units) {
    if (u.hp <= 0) continue;
    u.cooldown = Math.max(0, u.cooldown - DT);
    u.act = 'stand';
    const here = tileOf(map, u.x, u.y);
    if (u.on && !b.pieces[u.on]?.standing) u.on = 0; // knocked off a fallen piece

    if (u.side === 'defender') {
      if (UNITS[u.type].bow) {
        // Shoot first at raider archers who can shoot back, then at whoever is nearest.
        const foe =
          nearest(u, attackers, (f, d) => !!UNITS[f.type].bow && d <= reach(map, b, u, f) && d <= reach(map, b, f, u)) ??
          nearest(u, attackers, (f, d) => d <= reach(map, b, u, f));
        if (foe) shoot(u, foe);
        else if (u.on) walkTheWalls(u, attackers);
        continue;
      }
      // Swordsmen: fight anyone in reach, chase raiders near their post, otherwise go back to it.
      const foe = nearest(u, attackers, (_, d) => d <= COMBAT.meleeReach);
      if (foe) {
        strike(u, foe);
        continue;
      }
      const px = u.post % map.width;
      const py = (u.post - px) / map.width;
      const chase = nearest(u, attackers, (f, d) => d <= COMBAT.guardRadius + 2 && Math.hypot(f.x - px, f.y - py) <= COMBAT.guardRadius);
      if (chase) {
        const there = tileOf(map, chase.x, chase.y);
        if (there === here || clearWalk(map, here, there, der.defendCost)) {
          u.path = [];
          move(u, chase.x, chase.y, der.defendCost);
          continue;
        }
        // Round a corner (or the keep): find the way, every few ticks.
        if (u.retry <= 0 || u.path[0] !== here) {
          u.path = findPath(map, here, (i) => i === there, [chase.x, chase.y], der.defendCost, COMBAT.guardRadius * 4) ?? [];
          u.retry = 10;
        } else u.retry--;
        const step = u.path[1];
        if (step !== undefined) {
          move(u, (step % map.width) + u.ox, Math.floor(step / map.width) + u.oy, der.defendCost);
          if (tileOf(map, u.x, u.y) === step) u.path.shift();
          continue;
        }
      }
      if (u.post < 0 || here === u.post) {
        if (u.post >= 0 && Math.hypot(u.x - px - u.ox, u.y - py - u.oy) > 0.05) move(u, px + u.ox, py + u.oy, der.defendCost);
        continue;
      }
      if (u.path.length === 0 || u.path[0] !== here) {
        if (u.retry > 0) {
          u.retry--;
          continue;
        }
        u.path = findPath(map, here, (i) => i === u.post, [px, py], der.defendCost, 200) ?? [];
        if (u.path.length === 0) u.retry = simConfig.ticksPerSecond * 2;
      }
      const next = u.path[1];
      if (next === undefined) continue;
      const nx = next % map.width;
      const ny = (next - nx) / map.width;
      move(u, nx + u.ox, ny + u.oy, der.defendCost);
      if (tileOf(map, u.x, u.y) === next) u.path.shift();
      continue;
    }

    // Attackers.
    const kind = UNITS[u.type];
    if (b.phase === 'retreat') {
      const next = downhill(map, der.flee, here, der.attackCost);
      if (next === null) {
        if ((der.flee[here] as number) === 0) escaped.add(u.id); // got away off the map
        continue;
      }
      advance(u, next);
      continue;
    }
    if (kind.bow) {
      const target = nearest(u, defenders, (f, d) => d <= reach(map, b, u, f));
      if (target) {
        shoot(u, target);
        continue;
      }
    }
    const close = nearest(u, defenders, (f, d) => !f.on && d <= COMBAT.meleeReach);
    if (close) {
      strike(u, close);
      continue;
    }
    const near = nearest(u, defenders, (f, d) => !f.on && d <= COMBAT.raiderAggro && clearWalk(map, here, tileOf(map, f.x, f.y), der.attackWalk));
    if (near) {
      move(u, near.x, near.y, der.attackWalk);
      continue;
    }
    if (b.targetTiles.includes(here)) {
      // Nobody can loot with soldiers standing over the stores: they have to be dealt with first.
      const guard = nearest(u, defenders, (f, d) => !f.on && d <= COMBAT.guardRadius);
      if (guard) {
        if (clearWalk(map, here, tileOf(map, guard.x, guard.y), der.attackWalk)) move(u, guard.x, guard.y, der.attackWalk);
        continue;
      }
      u.act = 'loot';
      b.plunder += DT;
      continue;
    }
    // Mass at the front of the piece picked for battering, and batter it from there.
    const rally = b.pieces[b.rally];
    if (rally?.standing && der.rallyField && Number.isFinite(der.rallyField[here] as number)) {
      if (here === b.front || rally.tiles.some((t) => edgeNeighbours(map, t, here))) {
        if (rally.tiles.some((t) => edgeNeighbours(map, t, here))) advance(u, rally.tiles.find((t) => edgeNeighbours(map, t, here)) as number);
        else advance(u, rally.tiles[0] as number);
        continue;
      }
      const step = downhill(map, der.rallyField, here, der.attackWalk);
      if (step !== null) advance(u, step);
      continue;
    }
    const next = downhill(map, der.attack, here, der.attackCost);
    if (next !== null) advance(u, next);
  }

  /**
   * An archer with nobody in reach walks along the wall tops towards the nearest raider: to the
   * neighbouring wall, tower or gatehouse (if there's room on it), once they're at their own spot.
   */
  function walkTheWalls(u: Unit, foes: readonly Unit[]): void {
    const bs = b as BattleState;
    const p = bs.pieces[u.on];
    if (!p) return;
    const spot = p.tiles.includes(u.post) ? u.post : (p.tiles[0] as number);
    const sx = spot % map.width;
    const sy = (spot - sx) / map.width;
    if (Math.hypot(u.x - sx, u.y - sy) > 0.05) {
      const k = Math.min(1, (UNITS[u.type].speed * DT) / Math.hypot(u.x - sx, u.y - sy));
      u.x += (sx - u.x) * k;
      u.y += (sy - u.y) * k;
      u.act = 'walk';
      return;
    }
    // Only for raiders close by but out of reach; far-off ones may yet come anywhere.
    const foe = nearest(u, foes, (f, d) => d <= reach(map, bs, u, f) + COMBAT.wallWalk);
    if (!foe) return;
    const here = Math.hypot(foe.x - sx, foe.y - sy);
    let best: { piece: PieceCombat; tile: number; d: number } | null = null;
    for (const [dx, dy] of NEIGHBOURS) {
      const nx = sx + dx;
      const ny = sy + dy;
      if (!inBounds(map, nx, ny)) continue;
      const t = ny * map.width + nx;
      const q = pieceAt(t);
      if (!q || q === p || !q.standing || q.kind === 'keep') continue;
      if (Math.abs(heightAt(map, sx, sy) - heightAt(map, nx, ny)) >= 2) continue;
      if (bs.units.filter((o) => o.on === q.id && o.hp > 0).length >= COMBAT.postCapacity[q.kind]) continue;
      const d = Math.hypot(foe.x - nx, foe.y - ny);
      if (d < here - 0.5 && (!best || d < best.d)) best = { piece: q, tile: t, d };
    }
    if (!best) return;
    u.on = best.piece.id;
    u.post = best.tile;
    u.act = 'walk';
  }

  /** Walk on to the next tile, or batter the piece standing in it. */
  function advance(u: Unit, next: number): void {
    const p = pieceAt(next);
    if (p?.standing) {
      if (UNITS[u.type].batter <= 0) return; // archers wait for a way through
      // Only so many can swing at one piece; the rest wait their turn.
      const at = (batterers.get(p.id) ?? 0) + 1;
      if (at > COMBAT.batterersPerPiece) return;
      batterers.set(p.id, at);
      u.act = 'batter';
      p.batterFrom ??= seconds;
      p.hp -= UNITS[u.type].batter * DT * p.batterTaken;
      if (p.hp <= 0) {
        breach(p);
        der = derive(map, b as BattleState);
      }
      return;
    }
    const nx = next % map.width;
    const ny = (next - nx) / map.width;
    move(u, nx + u.ox, ny + u.oy, der.attackWalk);
  }

  function breach(p: PieceCombat): void {
    const bs = b as BattleState;
    p.hp = 0;
    p.standing = false;
    p.oilLeft = 0;
    p.breachedAt = seconds;
    // How many of your archers could reach the raiders at its foot when it fell.
    const foot = bs.units.filter((u) => u.side === 'attacker' && u.hp > 0 && Math.hypot(u.x - p.x, u.y - p.y) < 1.6);
    p.coveredBy = bs.units.filter((u) => u.side === 'defender' && u.hp > 0 && UNITS[u.type].bow && foot.some((f) => Math.hypot(f.x - u.x, f.y - u.y) <= reach(map, bs, u, f))).length;
    for (const u of bs.units) if (u.on === p.id) u.on = 0;
    bs.version++;
    result.pieces = true;
  }

  // The fallen.
  const dead = b.units.filter((u) => u.hp <= 0);
  for (const u of dead) b.stats.lost[u.type]++;
  b.stats.escaped += escaped.size;
  if (dead.length > 0 || escaped.size > 0) b.units = b.units.filter((u) => u.hp > 0 && !escaped.has(u.id));

  const raidersLeft = b.units.filter((u) => u.side === 'attacker').length;
  const came = RAIDER_TYPES.reduce((n, t) => n + b.stats.start[t], 0);
  const lost = RAIDER_TYPES.reduce((n, t) => n + b.stats.lost[t], 0);
  if (b.phase === 'fight') {
    if (came > 0 && lost / came >= COMBAT.breakAt) retreat(b, 'broke');
    else if (b.plunder >= COMBAT.plunderNeeded) {
      retreat(b, 'plundered');
      const st = s.economy.stores;
      const crowns = Math.round(st.crowns * COMBAT.plunder.crowns);
      const food = Math.round(st.food * COMBAT.plunder.food);
      st.crowns -= crowns;
      st.food -= food;
      s.economy.standing = Math.max(0, s.economy.standing - COMBAT.plunder.standing);
      b.stats.plundered = { crowns, food };
    } else if (seconds >= COMBAT.maxSeconds) retreat(b, 'gave up');
  }
  if (raidersLeft === 0 || (b.phase === 'retreat' && (b.tick - b.retreatTick) * DT >= COMBAT.fleeSeconds)) result.ended = true;
  return result;
}

/** The raiders pick where to break in: wherever their leader (the one nearest the target) will meet the walls. */
function pickRally(map: TerrainMap, b: BattleState, der: Derived): void {
  b.rallyVersion = b.version;
  b.rally = 0;
  b.front = -1;
  let leader: Unit | null = null;
  let best = Infinity;
  for (const u of b.units) {
    if (u.side !== 'attacker' || u.type !== 'raider') continue;
    const d = der.attack[tileOf(map, u.x, u.y)] as number;
    if (d < best) {
      best = d;
      leader = u;
    }
  }
  if (!leader) return;
  const strike = strikePoint(map, b, der, tileOf(map, leader.x, leader.y));
  if (!strike) return;
  b.rally = strike.piece;
  b.front = strike.front;
}

function retreat(b: BattleState, why: NonNullable<BattleState['why']>): void {
  b.phase = 'retreat';
  b.why = why;
  b.retreatTick = b.tick;
}

function edgeNeighbours(map: TerrainMap, a: number, b: number): boolean {
  const ax = a % map.width;
  const ay = (a - ax) / map.width;
  const bx = b % map.width;
  const by = (b - bx) / map.width;
  return Math.abs(ax - bx) + Math.abs(ay - by) === 1;
}

/** Diagonal steps need one of the two edge routes open, so nobody squeezes between two wall tiles. */
function stepOk(map: TerrainMap, from: number, to: number, cost: StepCost): boolean {
  const fx = from % map.width;
  const fy = (from - fx) / map.width;
  const tx = to % map.width;
  const ty = (to - tx) / map.width;
  const d = Math.abs(fx - tx) + Math.abs(fy - ty);
  if (d === 1) return cost(from, to) !== null;
  if (d !== 2 || fx === tx || fy === ty) return false;
  const a = fy * map.width + tx;
  const c = ty * map.width + fx;
  return (cost(from, a) !== null && cost(a, to) !== null) || (cost(from, c) !== null && cost(c, to) !== null);
}

// ---------------------------------------------------------------------------------------------
// Ending a battle.

/**
 * The battle is over: soldiers lost leave the garrison, damage to the castle undoes building work
 * (breached pieces are left as footings), and the report says what happened and why.
 */
export function endBattle(s: SimState, day: number): BattleReport {
  const b = s.defence.battle as BattleState;
  const { map } = s;
  for (const t of TROOP_TYPES) s.economy.troops[t] = Math.max(0, s.economy.troops[t] - b.stats.lost[t]);

  let repairs = 0;
  for (const pc of Object.values(b.pieces)) {
    if (pc.max <= 0 || pc.hp >= pc.max - 1e-6) continue;
    const rec = s.works.pieces[pc.id];
    const piece = s.plan.pieces.find((p) => p.id === pc.id);
    if (!rec || !piece) continue;
    const now = pc.standing ? pc.progress * (pc.hp / pc.max) : Math.min(pc.progress, COMBAT.breachedProgress);
    const factor = pc.progress > 0 ? now / pc.progress : 0;
    for (const t of TRADES) rec.done[t] *= factor;
    rec.complete = false;
    repairs += pieceCost(map, piece).labour * (pc.progress - now);
  }

  const outcome: Outcome = b.why === 'plundered' ? 'plundered' : b.why === 'gave up' || b.why === 'no way' ? 'held' : 'repelled';
  if (outcome !== 'plundered') s.economy.standing = Math.min(100, s.economy.standing + COMBAT.repelledStanding);
  const report = buildReport(s, b, day, outcome, Math.round(repairs));
  s.defence.battle = null;
  return report;
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

function buildReport(s: SimState, b: BattleState, day: number, outcome: Outcome, repairs: number): BattleReport {
  const { map } = s;
  const st = b.stats;
  const seconds = Math.round(b.tick * DT);
  const came = RAIDER_TYPES.reduce((n, t) => n + st.start[t], 0);
  const killed = RAIDER_TYPES.reduce((n, t) => n + st.lost[t], 0);
  const fought = TROOP_TYPES.reduce((n, t) => n + st.start[t], 0);
  const lostTroops = TROOP_TYPES.reduce((n, t) => n + st.lost[t], 0);
  const pieces = Object.values(b.pieces);
  const breached = pieces.filter((p) => p.breachedAt !== null).sort((a, c) => (a.breachedAt as number) - (c.breachedAt as number));
  const target = b.target === 'keep' ? 'the keep' : 'the camp';

  const headline =
    outcome === 'plundered'
      ? `Raiders plundered ${target}: ${st.plundered?.crowns ?? 0} crowns and ${st.plundered?.food ?? 0} food taken.`
      : b.why === 'broke'
        ? `Raid ${b.raid} beaten off: the raiders broke and fled after ${seconds} seconds.`
        : b.why === 'no way'
          ? `Raid ${b.raid}: the raiders found no way to ${target} and went home.`
          : `Raid ${b.raid} held off: the raiders gave up and left.`;

  const sections: BattleReport['sections'] = [];
  const raidersLine = RAIDER_TYPES.map((t) => `${st.lost[t]} of ${st.start[t]} ${UNITS[t].plural.toLowerCase()}`).join(', ');
  const ours = TROOP_TYPES.filter((t) => st.start[t] > 0).map((t) => `${st.lost[t]} of ${st.start[t]} ${UNITS[t].plural.toLowerCase()}`);
  const fight: ReportLine[] = [
    { text: `They came from the ${b.from} with ${describeStrength(raidStrength(b.raid))}, making for ${target}${b.target === 'camp' ? ' (no keep stands yet)' : ''}.` },
    { text: `Raiders killed: ${raidersLine}.`, cls: killed > 0 ? 'good' : undefined },
    { text: fought === 0 ? 'You had no soldiers to fight them.' : `Your losses: ${ours.join(', ')}.`, cls: lostTroops > 0 ? 'bad' : 'good' },
  ];
  if (st.plundered) fight.push({ text: `Plundered: ${st.plundered.crowns} crowns and ${st.plundered.food} food. Standing −${COMBAT.plunder.standing}.`, cls: 'bad' });
  else fight.push({ text: `Standing +${COMBAT.repelledStanding} for holding them off.`, cls: 'good' });
  sections.push({ title: 'The fight', lines: fight });

  const walls: ReportLine[] = [];
  for (const p of breached) {
    walls.push({ text: `Breached: ${p.name} at ${p.x}, ${p.y}, after ${batteredFor(p)} seconds of battering.`, cls: 'bad' });
    walls.push({ text: breachWhy(s, p), cls: 'dim' });
  }
  if (st.gaps.length > 0) {
    const g = st.gaps[0] as number;
    walls.push({
      text: `Raiders walked straight through ${plural(st.gaps.length, 'unfinished stretch', 'unfinished stretches')} (less than half built, so not yet in the way), first at ${g % map.width}, ${Math.floor(g / map.width)}.`,
      cls: 'bad',
    });
  }
  const damaged = pieces.filter((p) => p.standing && p.max > 0 && p.hp < p.max - 0.5).sort((a, c) => a.hp / a.max - c.hp / c.max);
  for (const p of damaged.slice(0, 3))
    walls.push({ text: `Damaged: ${p.name} at ${p.x}, ${p.y} (${Math.round(p.hp)} of ${p.max} HP left).`, cls: 'warn' });
  if (damaged.length > 3) walls.push({ text: `…and ${damaged.length - 3} more pieces damaged.`, cls: 'warn' });
  if (walls.length === 0) walls.push({ text: 'Nothing was breached or damaged.', cls: 'good' });
  if (repairs > 0) walls.push({ text: `Repairs: about ${repairs} worker-days of building to do again. Damaged pieces are back on the Building list.`, cls: 'dim' });
  sections.push({ title: 'The walls', lines: walls });

  const archers: ReportLine[] = [];
  const posts = Object.entries(st.postKills).sort((a, c) => c[1] - a[1] || Number(a[0]) - Number(c[0]));
  for (const [id, kills] of posts.slice(0, 3)) {
    const p = b.pieces[id];
    if (p) {
      const range = bowReach(p.levels);
      archers.push({ text: `Archers on the ${p.name.toLowerCase()} at ${p.x}, ${p.y} brought down ${kills} (reach ${range} tiles over the ground below it).`, cls: 'good' });
    } else archers.push({ text: `Archers on the ground brought down ${kills} (reach ${COMBAT.bowRange} tiles on level ground).`, cls: 'good' });
  }
  const tallest = pieces.filter((p) => st.manned.includes(p.id)).reduce((m, p) => Math.max(m, p.levels), 0);
  if (rangeBonus(tallest) > 0)
    archers.push({
      text: `Height pays: archers on your tallest manned piece reach ${bowReach(tallest)} tiles over the ground below it, while raider archers down there, shooting up, reach only ${bowReach(-tallest)}.`,
    });
  const saved = st.saved.slits + st.saved.battlements;
  if (saved > 0)
    archers.push({
      text: `Cover turned aside ${plural(saved, 'arrow', 'arrows')} that would have hit your archers (${st.saved.slits} by arrow slits, ${st.saved.battlements} by battlements alone).`,
    });
  if (st.saved.slits === 0 && st.saved.battlements > 2)
    archers.push({ text: `Arrow slits (Extras tool) turn aside twice as many as battlements alone.`, cls: 'dim' });
  for (const p of pieces.filter((pc) => pc.cauldron)) {
    const uses = st.oilUses[p.id] ?? 0;
    if (uses > 0)
      archers.push({ text: `The oil cauldron on the ${p.name.toLowerCase()} at ${p.x}, ${p.y} was poured ${plural(uses, 'time', 'times')} and killed ${st.oilKills[p.id] ?? 0}.`, cls: 'good' });
    else if (!p.complete) archers.push({ text: `The oil cauldron at ${p.x}, ${p.y} isn't finished yet, so it couldn't be used.`, cls: 'dim' });
    else if (!st.manned.includes(p.id))
      archers.push({ text: `The oil cauldron at ${p.x}, ${p.y} wasn't used: nobody was posted there to pour it.`, cls: 'dim' });
    else archers.push({ text: `The oil cauldron at ${p.x}, ${p.y} was manned, but no raiders came to its foot.`, cls: 'dim' });
  }
  if (archers.length > 0) sections.push({ title: 'Archers and extras', lines: archers });

  return {
    raid: b.raid,
    day,
    seconds,
    outcome,
    headline,
    attackers: { came, killed },
    defenders: { fought, lost: lostTroops },
    breaches: breached.map((p) => ({ id: p.id, name: p.name, x: p.x, y: p.y, seconds: batteredFor(p) })),
    gaps: st.gaps.length,
    plunder: st.plundered,
    repairs,
    sections,
  };
}

/** One plain-words reason a piece fell, and what would have helped. */
function breachWhy(s: SimState, p: PieceCombat): string {
  const parts: string[] = [];
  if (!p.complete) parts.push(`It was only ${Math.round(p.progress * 100)}% built, so it had ${p.max} of its ${p.full} HP.`);
  const piece = s.plan.pieces.find((q) => q.id === p.id) as Piece | undefined;
  if (piece?.kind === 'wall' && piece.thickness !== 'thick')
    parts.push(`${WALL_THICKNESS[piece.thickness].name} walls have ${WALL_THICKNESS[piece.thickness].hp} HP; a thick wall has ${WALL_THICKNESS.thick.hp}.`);
  if (piece?.kind === 'tower' && piece.shape === 'square') parts.push('A round tower takes a quarter less battering.');
  if (p.coveredBy === 0) parts.push('None of your archers could reach the raiders at its foot.');
  else parts.push(`${plural(p.coveredBy, 'archer', 'archers')} could reach the raiders at its foot.`);
  return parts.join(' ');
}

/** Short counts for the top bar while a battle is on. */
export function battleCounts(b: BattleState): Record<UnitType, number> & { attackers: number; defenders: number } {
  const c = { ...zeroUnits(), attackers: 0, defenders: 0 };
  for (const u of b.units) {
    c[u.type]++;
    if (u.side === 'attacker') c.attackers++;
    else c.defenders++;
  }
  return c;
}

export function battleSeconds(b: BattleState): number {
  return b.tick * DT;
}

export type { RaiderType };
