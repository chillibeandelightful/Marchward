import { LADDER_REACH, WALL_THICKNESS } from '../data/castle';
import { COMBAT, RAIDER_TYPES, RAIDS, SIEGE, TROOP_TYPES, UNITS, type RaiderType, type Side, type TroopType, type UnitType } from '../data/combat';
import { simConfig } from '../data/config';
import { TRADES } from '../data/economy';
import { batterTaken, bridgeEnds, footprint, gateEnds, hasSlits, isMoatLike, pieceCost, pieceHp, pieceLevels, pieceName, rangeBonus, sapSeconds, type Piece, type PieceKind } from './castle';
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
  act: 'stand' | 'walk' | 'fight' | 'batter' | 'shoot' | 'loot' | 'sap' | 'raise';
  /** Piece it was posted on at the start (0 for the ground), for the report. */
  postedOn: number;
  /** Ladder crews: still carrying their ladder (missing in saves from before M6). */
  ladder?: boolean;
  /** Sappers digging, or a ladder crew raising its ladder: seconds at it so far (0 when not). */
  work?: number;
  /** Swordsmen: the raider they have gone out after (0 or missing for none). */
  sortie?: number;
  /** Swordsmen: ticks before they'll go out again after coming back in. */
  rest?: number;
  /** Commander mode: the order this soldier is carrying out, if any. */
  order?: Order | null;
}

/** An order given in Commander mode: go to a tile (onto a wall or tower, for archers), or go after one raider. */
export type Order = { kind: 'move'; tile: number } | { kind: 'attack'; target: number };

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
  /** Sapper-seconds of digging under it so far, and needed to bring it down (null: can't be undermined). */
  sap?: number;
  sapNeed?: number | null;
  /** Seconds into the battle the sappers started on it. */
  sapFrom?: number | null;
  /** How it fell: battered down, or undermined. */
  cause?: 'batter' | 'sap';
  /** Gatehouse: drawn open until this tick, as soldiers go through. */
  openUntil?: number;
  /** Gatehouse: the tile of its passage (the others of a wide gatehouse are its flanking towers). */
  passage?: number;
  /** Gatehouse: the tiles at either end of its passage. Battered from anywhere else (beside a flanking tower) it holds out twice as long. */
  ends?: number[];
  /** Gatehouse with a drawbridge: the moat tiles it spans, and its HP left (0 once battered down). */
  bridgeTiles?: number[];
  bridge?: number;
}

/** A ladder raised against a piece, from the tile at its foot. Kept after it is pushed away, for drawing. */
export interface Ladder {
  piece: number;
  tile: number;
  /** Defender-seconds spent pushing it. */
  push: number;
  up: boolean;
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
  /** Lobbed high over a wall in the way. */
  lob?: boolean;
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
  /** Ladders, sorties and shots over walls (missing in saves from before M6). */
  siege?: SiegeStats;
}

export interface SiegeStats {
  /** Spots at the start where sappers could dig and ladders could go up (missing in older saves). */
  sapSpots?: number;
  ladderSpots?: number;
  laddersUp: number;
  laddersPushed: number;
  /** Raiders who climbed onto your walls by ladder. */
  climbed: number;
  /** Times your swordsmen went out after raiders. */
  sorties: number;
  /** Arrows lobbed over a wall in the way. */
  lobbed: number;
  /** Sappers killed while digging, and raiders killed up on your walls. */
  sappersKilled: number;
  /** Drawbridges battered down (missing in older saves). */
  bridgesBroken?: number;
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
  /** Ladders raised (missing in saves from before M6). */
  ladders?: Ladder[];
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
  /** Pieces with a ladder up against them: raiders can climb over them, both ways. */
  laddered: Set<number>;
  /** Route-finding costs for raiders, which count battering, undermining or laddering a piece as so much walking. */
  attackCost: StepCost;
  /** Where raiders can actually walk now: not into standing pieces, except over a ladder. */
  attackWalk: StepCost;
  defendCost: StepCost;
  attack: Float64Array;
  flee: Float64Array;
  /** 1 on tiles raiders can walk to from the map edge without breaking in. */
  outside: Uint8Array;
  /** Towards the front of the rally piece, for the tile it was worked out for. */
  rallyField: Float64Array | null;
  rallyFront: number;
  /** Towards the best spots for sappers to dig and ladder crews to raise ladders, and the spots themselves (tile -> piece id). */
  sapField: Float64Array;
  sapSpots: Map<number, number>;
  ladderField: Float64Array;
  ladderSpots: Map<number, number>;
}

const derived = new WeakMap<BattleState, Derived>();

/** Who the raiders still have, which decides which ways in they think are cheap. */
function strengthLeft(b: BattleState): { batterers: number; sappers: number; ladders: number } {
  let batterers = 0;
  let sappers = 0;
  let ladders = 0;
  // Before they arrive, go by what the scouts say is coming.
  if (!b.units.some((u) => u.side === 'attacker')) {
    const st = raidStrength(b.raid);
    for (const t of RAIDER_TYPES) if (UNITS[t].batter > 0) batterers += st[t];
    return { batterers, sappers: st.sapper, ladders: st.ladderCrew };
  }
  for (const u of b.units) {
    if (u.side !== 'attacker' || u.hp <= 0) continue;
    if (u.type === 'sapper') sappers++;
    else if (u.type === 'ladderCrew' && u.ladder !== false) ladders++;
    if (UNITS[u.type].batter > 0) batterers++;
  }
  return { batterers, sappers, ladders };
}

/**
 * What it costs raiders, in tiles of walking, to get through a standing piece from the tile in
 * front of it: the cheapest of battering it down, undermining it and laddering it, for the
 * raiders they have.
 */
function breakInCost(map: TerrainMap, p: PieceCombat, from: number, have: { batterers: number; sappers: number; ladders: number }, laddered: boolean): number | null {
  if (p.kind === 'keep') return null;
  const climb = SIEGE.ladder.climb;
  if (laddered) return climb;
  const fx = from % map.width;
  const fy = (from - fx) / map.width;
  const moat = isMoatLike(map, fx, fy);
  let best = Infinity;
  if (have.batterers > 0) {
    // A raised drawbridge has to come down first, battered from the moat at a slower rate.
    const bridge = p.bridgeTiles?.includes(from) ? (p.bridge ?? 0) : 0;
    const slow = (bridge > 0 ? SIEGE.drawbridge.batter : 1) * gateShare(p, from);
    best = (COMBAT.batterCostPerHp * (p.hp / p.batterTaken + bridge)) / slow;
  }
  // Walking a tile takes about 2.5 seconds, so seconds of work count as that many tiles.
  const secondsPerTile = 1 / UNITS.raider.speed;
  const need = p.sapNeed ?? null;
  if (have.sappers > 0 && need !== null && !moat)
    best = Math.min(best, (need - (p.sap ?? 0)) / Math.min(have.sappers, SIEGE.sap.perPiece) / secondsPerTile);
  if (have.ladders > 0 && !moat && canLadder(map, p, from)) best = Math.min(best, climb + SIEGE.ladder.raise / secondsPerTile);
  return Number.isFinite(best) ? best : null;
}

/** Battering a gatehouse anywhere but at its gate (beside a flanking tower, say) goes at this share of the usual rate. */
function gateShare(p: PieceCombat, from: number): number {
  return p.kind === 'gatehouse' && p.ends && !p.ends.includes(from) ? SIEGE.gateFlankBatter : 1;
}

/** Can a ladder from this tile reach the top of the piece? Not from a moat or water. */
function canLadder(map: TerrainMap, p: PieceCombat, from: number): boolean {
  const fx = from % map.width;
  const fy = (from - fx) / map.width;
  if (p.kind === 'keep' || isMoatLike(map, fx, fy) || terrainAt(map, fx, fy).moveCost === null) return false;
  return p.ground + p.levels - heightAt(map, fx, fy) <= LADDER_REACH;
}

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
  const laddered = new Set((b.ladders ?? []).filter((l) => l.up && b.pieces[l.piece]?.standing).map((l) => l.piece));
  const have = strengthLeft(b);
  const bridged = new Set<number>();
  for (const p of Object.values(b.pieces)) if (p.standing && (p.bridge ?? 0) > 0) for (const t of p.bridgeTiles ?? []) bridged.add(t);
  const attackCost: StepCost = (i, j) => {
    const land = landCost(map, i, j);
    if (land === null) return null;
    const p = at(j);
    if (!p) return land;
    if (!p.standing) return land * COMBAT.rubbleCost;
    const from = at(i);
    if (from?.standing) return null; // no walking along the wall tops
    const extra = breakInCost(map, p, i, have, laddered.has(p.id));
    return extra === null ? null : land + extra;
  };
  const attackWalk: StepCost = (i, j) => {
    const p = at(j);
    if (p?.standing && !laddered.has(p.id)) return null;
    return attackCost(i, j);
  };
  const defendCost: StepCost = (i, j) => {
    const land = landCost(map, i, j);
    if (land === null) return null;
    // Across the moat on a drawbridge, lowered for them, as on dry land.
    if (bridged.has(j) || bridged.has(i)) return 1;
    const p = at(j);
    if (!p) return land;
    if (!p.standing) return land * COMBAT.rubbleCost;
    return p.kind === 'gatehouse' && j === p.passage ? land : null;
  };
  // Outside: where the raiders can walk from where they are (or their edge, before they arrive)
  // without breaking in or climbing.
  const walkOnly: StepCost = (i, j) => (at(j)?.standing ? null : attackCost(i, j));
  const raiderTiles = b.units.filter((u) => u.side === 'attacker' && u.hp > 0 && !u.on).map((u) => tileOf(map, u.x, u.y));
  const fromEdge = distanceField(map, raiderTiles.length > 0 ? raiderTiles : edgeTiles(map, b.from), walkOnly);
  const outside = new Uint8Array(fromEdge.length);
  for (let i = 0; i < fromEdge.length; i++) if (Number.isFinite(fromEdge[i] as number)) outside[i] = 1;
  const attack = distanceField(map, b.targetTiles, attackCost);

  // Spots at the foot of a piece, outside and not in a moat, from which it leads somewhere (inside).
  const sapSpots = new Map<number, number>();
  const ladderSpots = new Map<number, number>();
  const ladderAt = new Set((b.ladders ?? []).filter((l) => l.up).map((l) => l.tile));
  for (const p of Object.values(b.pieces)) {
    if (!p.standing || p.kind === 'keep') continue;
    const inside = p.tiles.some((t) => edgeTiles4(map, t).some((n) => !at(n)?.standing && !outside[n] && terrainAt(map, n % map.width, Math.floor(n / map.width)).moveCost !== null));
    if (!inside) continue;
    for (const t of p.tiles)
      for (const n of edgeTiles4(map, t)) {
        if (at(n)?.standing || !outside[n]) continue;
        const nx = n % map.width;
        const ny = (n - nx) / map.width;
        if (isMoatLike(map, nx, ny) || terrainAt(map, nx, ny).moveCost === null) continue;
        if (p.sapNeed !== null && p.sapNeed !== undefined) sapSpots.set(n, p.id);
        if (canLadder(map, p, n) && !ladderAt.has(n) && !laddered.has(p.id)) ladderSpots.set(n, p.id);
      }
  }
  // Prefer the piece the raiders mean to break in at (the one on the cheapest way in), then the weakest.
  const strike = (() => {
    let i = -1;
    for (const u of b.units) {
      if (u.side !== 'attacker' || u.hp <= 0) continue;
      const t = tileOf(map, u.x, u.y);
      if (i < 0 || (attack[t] as number) < (attack[i] as number)) i = t;
    }
    if (i < 0) return 0;
    for (let n = 0; n < map.width * map.height; n++) {
      const next = downhill(map, attack, i, attackCost);
      if (next === null) return 0;
      const p = at(next);
      if (p?.standing && !laddered.has(p.id)) return p.id;
      i = next;
    }
    return 0;
  })();
  const sapStart = (t: number) => {
    const p = b.pieces[sapSpots.get(t) as number] as PieceCombat;
    return (p.id === strike ? 0 : 6) + ((p.sapNeed ?? 0) - (p.sap ?? 0)) * UNITS.sapper.speed * 0.25;
  };
  const ladderStart = (t: number) => ((ladderSpots.get(t) as number) === strike ? 0 : 6);

  const d: Derived = {
    version: b.version,
    occupant,
    laddered,
    attackCost,
    attackWalk,
    defendCost,
    attack,
    flee: distanceField(map, edgeTiles(map), attackCost),
    outside,
    rallyField: b.front >= 0 ? distanceField(map, [b.front], attackWalk) : null,
    rallyFront: b.front,
    sapSpots,
    sapField: distanceField(map, [...sapSpots.keys()], attackWalk, sapStart),
    ladderSpots,
    ladderField: distanceField(map, [...ladderSpots.keys()], attackWalk, ladderStart),
  };
  derived.set(b, d);
  return d;
}

/** The edge neighbours of a tile that are on the map. */
function edgeTiles4(map: TerrainMap, i: number): number[] {
  const x = i % map.width;
  const y = (i - x) / map.width;
  const out: number[] = [];
  for (const [dx, dy] of NEIGHBOURS) if (inBounds(map, x + dx, y + dy)) out.push((y + dy) * map.width + x + dx);
  return out;
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
  return { swordsman: 0, archer: 0, raider: 0, raiderArcher: 0, sapper: 0, ladderCrew: 0 };
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
      sap: 0,
      // Rock can't be dug under; a half-built piece comes down in proportion.
      sapNeed: p.kind === 'keep' || footprint(p).some(([x, y]) => terrainAt(s.map, x, y).id === 'rock') ? null : sapSeconds(p) * Math.min(1, progress),
      sapFrom: null,
    };
    if (p.kind === 'gatehouse') {
      const pc = out[p.id] as PieceCombat;
      pc.passage = p.y * s.map.width + p.x;
      pc.ends = gateEnds(p)
        .filter(([x, y]) => inBounds(s.map, x, y))
        .map(([x, y]) => y * s.map.width + x);
      const ends = complete ? bridgeEnds(s.map, p) : [];
      if (ends.length > 0) {
        pc.bridgeTiles = ends.map(([x, y]) => y * s.map.width + x);
        pc.bridge = SIEGE.drawbridge.hp;
      }
    }
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

/** A battle with nobody on the field yet. */
function blankBattle(s: SimState, raid: number, from: Edge): BattleState {
  const pieces = combatPieces(s);
  const { target, tiles } = chooseTarget(s, pieces);
  return {
    tick: 0,
    raid,
    from,
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
      siege: { laddersUp: 0, laddersPushed: 0, climbed: 0, sorties: 0, lobbed: 0, sappersKilled: 0 },
    },
    ladders: [],
  };
}

/**
 * Where the next raid will come from: the raiders weigh each map edge by its cheapest way in to
 * what they're after (battering, undermining or laddering, with the men they're bringing), and
 * mostly pick a cheap one, but not always the cheapest, and seldom the side they came from last.
 */
export function chooseApproach(s: SimState, rng: Rng): Edge {
  const d = s.defence;
  const b = blankBattle(s, d.raidCount + 1, d.from);
  const der = derive(s.map, b);
  const costs = EDGES.map((e) => {
    let best = Infinity;
    for (const i of edgeTiles(s.map, e)) best = Math.min(best, der.attack[i] as number);
    return best + (e === d.lastFrom ? RAIDS.repeatPenalty : 0);
  });
  const cheapest = Math.min(...costs);
  if (!Number.isFinite(cheapest)) return d.from;
  const weights = costs.map((c) => (Number.isFinite(c) ? Math.pow(0.5, (c - cheapest) / RAIDS.costSpread) : 0));
  let r = rng.next() * weights.reduce((a, w) => a + w, 0);
  for (let k = 0; k < EDGES.length; k++) {
    r -= weights[k] as number;
    if (r < 0) return EDGES[k] as Edge;
  }
  return EDGES[costs.indexOf(cheapest)] as Edge;
}

/** Start the raid that is due: the raiders arrive at one edge and the garrison takes its posts. */
export function startBattle(s: SimState, rng: Rng): BattleState {
  const { map } = s;
  const d = s.defence;
  d.raidCount++;
  const b = blankBattle(s, d.raidCount, d.from);
  const der = derive(map, b);

  // The raiders gather at their edge, round a spot picked from the cheapest third of the ways in.
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
  const cheap = [...spawn].sort((a, c) => (der.attack[a] as number) - (der.attack[c] as number) || a - c);
  const centre = cheap.length > 0 ? rng.pick(cheap.slice(0, Math.max(1, Math.ceil(cheap.length / 3)))) : 0;
  d.lastFrom = b.from;
  const cx = centre % map.width;
  const cy = (centre - cx) / map.width;
  const near = [...spawn].sort((a, c) => tileDist(map, a, cx, cy) - tileDist(map, c, cx, cy) || a - c).slice(0, 8);
  const strength = raidStrength(b.raid);
  let k = 0;
  for (const t of RAIDER_TYPES)
    for (let i = 0; i < strength[t]; i++, k++) {
      const tile = near[k % Math.max(1, near.length)] ?? centre;
      const u = newUnit(b, rng, t, tile % map.width, Math.floor(tile / map.width));
      if (t === 'ladderCrew') u.ladder = true;
      b.stats.start[t]++;
    }
  if (!near.some((i) => Number.isFinite(der.attack[i]))) {
    b.phase = 'retreat';
    b.why = 'no way';
  }

  placeDefenders(s, b, rng, der, cx, cy);
  b.stats.manned = [...new Set(b.units.filter((u) => u.on).map((u) => u.on))];
  const sg = b.stats.siege as SiegeStats;
  sg.sapSpots = der.sapSpots.size;
  sg.ladderSpots = der.ladderSpots.size;
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
  // With more than one gate, the one nearest where the raiders gathered.
  const gate = s.plan.pieces
    .filter((p) => p.kind === 'gatehouse' && b.pieces[p.id]?.standing)
    .sort((a, c) => Math.hypot(a.x - ex, a.y - ey) - Math.hypot(c.x - ex, c.y - ey) || a.id - c.id)[0];
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
 * Commander mode: give an order to some of your soldiers. Swordsmen fight on the ground, so they
 * can't be sent onto a piece; archers can. Returns how many took the order.
 */
export function orderUnits(s: SimState, ids: readonly number[], order: Order): number {
  const b = s.defence.battle;
  if (!b || b.phase !== 'fight') return 0;
  const { map } = s;
  const der = derive(map, b);
  let taken = 0;
  for (const u of b.units) {
    if (u.side !== 'defender' || u.hp <= 0 || !ids.includes(u.id)) continue;
    if (order.kind === 'attack') {
      const foe = b.units.find((f) => f.id === order.target && f.side === 'attacker' && f.hp > 0);
      if (!foe) continue;
    } else {
      if (order.tile < 0 || order.tile >= map.width * map.height) continue;
      const p = b.pieces[der.occupant[order.tile] as number];
      if (p?.standing && !UNITS[u.type].bow) continue;
      if (!p?.standing && terrainAt(map, order.tile % map.width, Math.floor(order.tile / map.width)).moveCost === null) continue;
    }
    u.order = { ...order };
    u.path = [];
    u.retry = 0;
    u.sortie = 0;
    taken++;
  }
  return taken;
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
    if (p?.standing && !der.laddered.has(p.id)) return { piece: p.id, front: i };
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
  const siege = (b.stats.siege ??= { laddersUp: 0, laddersPushed: 0, climbed: 0, sorties: 0, lobbed: 0, sappersKilled: 0 });
  const ladders = (b.ladders ??= []);
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
    const below = attackers.filter((u) => u.hp > 0 && !u.on && Math.hypot(u.x - p.x, u.y - p.y) <= COMBAT.cauldron.radius);
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

  // Ladders: soldiers on the piece push a ladder away, unless raiders are already up on it.
  for (const l of ladders) {
    if (!l.up) continue;
    const p = b.pieces[l.piece];
    if (!p?.standing) {
      l.up = false;
      continue;
    }
    if (attackers.some((u) => u.on === p.id)) continue;
    const pushers = defenders.filter((u) => u.on === p.id).length;
    if (pushers === 0) continue;
    l.push += pushers * DT;
    if (l.push >= SIEGE.ladder.push) {
      l.up = false;
      siege.laddersPushed++;
      b.version++;
      der = derive(map, b);
    }
  }

  const pieceAt = (i: number) => b.pieces[der.occupant[i] as number];
  /** The gatehouse whose drawbridge spans a moat tile. */
  const bridgeOver = new Map<number, PieceCombat>();
  for (const p of Object.values(b.pieces)) for (const t of p.bridgeTiles ?? []) bridgeOver.set(t, p);

  /**
   * Can a unit shoot at another? Clear, or only by lobbing over a piece in the way (less accurate),
   * or not at all. A piece blocks unless the shooter stands at least as high as its top; a lob only
   * clears it with both shooter and target well away from it.
   */
  const sight = (u: Unit, foe: Unit): 'clear' | 'lob' | 'blocked' => {
    const from = tileOf(map, u.x, u.y);
    const to = tileOf(map, foe.x, foe.y);
    const level = unitLevel(map, b as BattleState, u);
    let out: 'clear' | 'lob' | 'blocked' = 'clear';
    walkLine([from % map.width, Math.floor(from / map.width)], [to % map.width, Math.floor(to / map.width)], (x, y) => {
      if (out === 'blocked') return;
      const i = y * map.width + x;
      if (i === from || i === to) return;
      const p = pieceAt(i);
      if (!p?.standing || p.id === u.on || p.id === foe.on) return;
      if (level >= p.ground + p.levels) return;
      if (Math.hypot(u.x - x, u.y - y) >= SIEGE.lobClear && Math.hypot(foe.x - x, foe.y - y) >= SIEGE.lobClear) out = 'lob';
      else out = 'blocked';
    });
    return out;
  };
  const canShoot = (u: Unit, f: Unit, d: number) => d <= reach(map, b as BattleState, u, f) && sight(u, f) !== 'blocked';

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
    u.work = 0;
    const p = pieceAt(to);
    // Through the gatehouse (or over its drawbridge): the gate is drawn open behind them for a moment.
    const gate = p?.kind === 'gatehouse' ? p : u.side === 'defender' ? bridgeOver.get(to) : undefined;
    if (u.side === 'defender' && gate?.standing) gate.openUntil = b.tick + Math.round(SIEGE.sortie.gateOpen * simConfig.ticksPerSecond);
    if (u.side === 'attacker' && to !== from) {
      if (p && !p.standing && p.breachedAt === null && !b.stats.gaps.includes(to)) b.stats.gaps.push(to);
      // Up a ladder onto the wall, or down off it.
      const was = u.on;
      u.on = p?.standing ? p.id : 0;
      if (u.on && u.on !== was) siege.climbed++;
    }
  };

  const strike = (u: Unit, foe: Unit): void => {
    u.act = 'fight';
    u.work = 0;
    if (u.cooldown > 0) return;
    foe.hp -= UNITS[u.type].melee.damage;
    u.cooldown = UNITS[u.type].melee.cooldown;
  };

  const shoot = (u: Unit, foe: Unit): void => {
    u.act = 'shoot';
    const bow = UNITS[u.type].bow;
    if (!bow || u.cooldown > 0) return;
    u.cooldown = bow.cooldown;
    const p = foe.on && foe.side === 'defender' ? b.pieces[foe.on] : undefined;
    const cover = p ? (p.complete ? (p.slits ? COMBAT.cover.slits : COMBAT.cover.battlements) : COMBAT.cover.unfinished) : 0;
    const trees = !foe.on && terrainAt(map, Math.round(foe.x), Math.round(foe.y)).id === 'forest' ? 1 - COMBAT.forestCover : 1;
    // A sapper at work is under a timber shelter.
    const shelter = foe.type === 'sapper' && (foe.work ?? 0) > 0 ? 1 - SIEGE.sap.cover : 1;
    const lob = sight(u, foe) === 'lob';
    if (lob) siege.lobbed++;
    // Shooting up is harder: each level the target stands above the shooter takes some off.
    const up = Math.max(0, unitLevel(map, b, foe) - unitLevel(map, b, u));
    const chance = bow.hit * trees * shelter * (lob ? SIEGE.lobHit : 1) * Math.max(0.4, 1 - COMBAT.upwardPenalty * up);
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
      arrive: b.tick + Math.max(1, Math.round((dist / COMBAT.arrowSpeed) * (lob ? 1.4 : 1) * simConfig.ticksPerSecond)),
      damage: bow.damage,
      hit,
      ...(lob ? { lob: true } : {}),
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

  // Sorties: how many swordsmen may be out at once, and how many are.
  const swords = defenders.filter((u) => u.type === 'swordsman');
  const sortieCap = Math.ceil(swords.length * SIEGE.sortie.share);
  let out = swords.filter((u) => u.sortie).length;
  /** Worth going out for: raider archers, sappers and ladder crews first, then anyone at the walls. */
  const sortieTarget = (u: Unit): Unit | null => {
    let best: Unit | null = null;
    let bestScore = Infinity;
    for (const f of attackers) {
      if (f.hp <= 0 || f.on) continue;
      const d = Math.hypot(f.x - u.x, f.y - u.y);
      if (d > SIEGE.sortie.reach) continue;
      const t = tileOf(map, f.x, f.y);
      if (!der.outside[t]) continue;
      const score = d - (f.type === 'raiderArcher' || f.type === 'sapper' || f.type === 'ladderCrew' ? 8 : 0);
      if (score < bestScore && oddsOk(f, Math.min(sortieCap, swords.length))) {
        best = f;
        bestScore = score;
      }
    }
    return best;
  };
  /** Would this many swordsmen not be badly outnumbered by the raiders round the target? */
  const oddsOk = (f: Unit, n: number): boolean => {
    let foes = 0;
    for (const a of attackers) if (a.hp > 0 && !a.on && UNITS[a.type].melee.damage >= 6 && Math.hypot(a.x - f.x, a.y - f.y) <= SIEGE.sortie.around) foes++;
    return foes <= SIEGE.sortie.odds * Math.max(1, n);
  };

  const escaped = new Set<number>();
  const batterers = new Map<number, number>();
  const sappers = new Map<number, number>();
  for (const u of b.units) {
    if (u.hp <= 0) continue;
    u.cooldown = Math.max(0, u.cooldown - DT);
    u.act = 'stand';
    const here = tileOf(map, u.x, u.y);
    if (u.on && !b.pieces[u.on]?.standing) u.on = 0; // knocked off a fallen piece

    if (u.side === 'defender') {
      // Anyone on a piece fights raiders who have climbed up onto it.
      if (u.on) {
        const climber = nearest(u, attackers, (f, d) => f.on === u.on && d <= COMBAT.meleeReach + 0.6);
        if (climber) {
          strike(u, climber);
          continue;
        }
      }
      if (u.order && obey(u, here)) continue;
      if (UNITS[u.type].bow) {
        // Shoot first at raider archers who can shoot back, then at whoever is nearest.
        const foe =
          nearest(u, attackers, (f, d) => !!UNITS[f.type].bow && canShoot(u, f, d) && d <= reach(map, b, f, u)) ?? nearest(u, attackers, (f, d) => canShoot(u, f, d));
        if (foe) shoot(u, foe);
        else if (u.on) walkTheWalls(u, attackers);
        continue;
      }
      // Swordsmen fight on the ground: anyone in reach first.
      const foe = nearest(u, attackers, (f, d) => !f.on && d <= COMBAT.meleeReach);
      if (foe) {
        strike(u, foe);
        continue;
      }
      if (sortie(u, here)) continue;
      // Chase raiders near their post, otherwise go back to it.
      const px = u.post % map.width;
      const py = (u.post - px) / map.width;
      const chase = nearest(u, attackers, (f, d) => !f.on && d <= COMBAT.guardRadius + 2 && Math.hypot(f.x - px, f.y - py) <= COMBAT.guardRadius);
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
      if (u.path.length === 0 || u.path[0] !== here || u.path[u.path.length - 1] !== u.post) {
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
    // Up on a wall: deal with the soldiers there before going down the other side.
    if (u.on) {
      const guard = nearest(u, defenders, (f) => f.on === u.on);
      if (guard) {
        if (Math.hypot(guard.x - u.x, guard.y - u.y) <= COMBAT.meleeReach + 0.6) strike(u, guard);
        else move(u, guard.x, guard.y, () => 1);
        continue;
      }
    }
    if (kind.bow) {
      const target = nearest(u, defenders, (f, d) => canShoot(u, f, d));
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
    // Sappers and ladder crews go about their own work, unless soldiers come at them.
    if (siegeWork(u, here)) continue;
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
   * Commander mode: carry out an order. Returns false when the soldier should act as usual this
   * tick (an archer with nobody to shoot at, say), true when the order kept it busy.
   */
  function obey(u: Unit, here: number): boolean {
    const bs = b as BattleState;
    const order = u.order as Order;
    if (order.kind === 'attack') {
      const foe = bs.units.find((f) => f.id === order.target && f.hp > 0);
      if (!foe) {
        u.order = null;
        u.post = u.on ? u.post : here;
        return false;
      }
      const d = Math.hypot(foe.x - u.x, foe.y - u.y);
      if (UNITS[u.type].bow && canShoot(u, foe, d)) {
        shoot(u, foe);
        return true;
      }
      if (!UNITS[u.type].bow && d <= COMBAT.meleeReach && (!foe.on || foe.on === u.on)) {
        strike(u, foe);
        return true;
      }
      // Archers up on a piece stay there and shoot at whoever they can meanwhile.
      if (u.on) return false;
      return walkTo(u, here, tileOf(map, foe.x, foe.y), foe.x, foe.y);
    }
    const goal = order.tile;
    const target = pieceAt(goal);
    const onto = target?.standing ? target : undefined;
    // Down off the piece first, unless it's along the same piece.
    if (u.on && (!onto || onto.id !== u.on)) {
      const p = bs.pieces[u.on] as PieceCombat;
      const down = stepDown(p, goal);
      if (down === null) {
        u.order = null;
        return false;
      }
      u.on = 0;
      u.x = (down % map.width) + u.ox * 0.5;
      u.y = Math.floor(down / map.width) + u.oy * 0.5;
      u.post = down;
      u.act = 'walk';
      return true;
    }
    if (onto && u.on === onto.id) {
      // Along the same piece to another of its tiles.
      u.post = goal;
      u.order = null;
      return false;
    }
    if (onto) {
      // Up onto a wall or tower from a tile beside it, if there's room.
      if (onto.tiles.some((t) => edgeNeighbours(map, t, here))) {
        u.order = null;
        if (bs.units.filter((o) => o.on === onto.id && o.hp > 0).length >= COMBAT.postCapacity[onto.kind]) {
          u.post = here;
          return false;
        }
        u.on = onto.id;
        u.post = goal;
        u.x = goal % map.width;
        u.y = Math.floor(goal / map.width);
        u.act = 'walk';
        return true;
      }
      const beside = (i: number) => onto.tiles.some((t) => edgeNeighbours(map, t, i)) && !pieceAt(i)?.standing;
      if (u.retry <= 0 || u.path[0] !== here || !beside(u.path[u.path.length - 1] ?? -1)) {
        u.path = findPath(map, here, beside, [goal % map.width, Math.floor(goal / map.width)], der.defendCost, 400) ?? [];
        u.retry = 15;
        if (u.path.length === 0) {
          u.order = null;
          return false;
        }
      } else u.retry--;
      return followPath(u);
    }
    if (here === goal) {
      u.order = null;
      u.post = goal;
      return false;
    }
    return walkTo(u, here, goal, goal % map.width + u.ox, Math.floor(goal / map.width) + u.oy);
  }

  /** Walk towards a tile (or a point on it), finding the way round walls every so often. False if there's no way. */
  function walkTo(u: Unit, here: number, there: number, x: number, y: number): boolean {
    if (there === here || (Math.hypot(x - u.x, y - u.y) < 3 && clearWalk(map, here, there, der.defendCost))) {
      move(u, x, y, der.defendCost);
      return true;
    }
    if (u.retry <= 0 || u.path[0] !== here || u.path[u.path.length - 1] !== there) {
      u.path = findPath(map, here, (i) => i === there, [there % map.width, Math.floor(there / map.width)], der.defendCost, 400) ?? [];
      u.retry = 15;
      if (u.path.length === 0) {
        u.order = null;
        return false;
      }
    } else u.retry--;
    return followPath(u);
  }

  function followPath(u: Unit): boolean {
    const step = u.path[1];
    if (step === undefined) return true;
    move(u, (step % map.width) + u.ox, Math.floor(step / map.width) + u.oy, der.defendCost);
    if (tileOf(map, u.x, u.y) === step) u.path.shift();
    return true;
  }

  /** The tile beside a piece to climb down to: open ground inside the walls if there is any, nearest the goal. */
  function stepDown(p: PieceCombat, goal: number): number | null {
    let best: number | null = null;
    let bestScore = Infinity;
    for (const t of p.tiles)
      for (const n of edgeTiles4(map, t)) {
        if (pieceAt(n)?.standing || terrainAt(map, n % map.width, Math.floor(n / map.width)).moveCost === null) continue;
        const score = (der.outside[n] ? 100 : 0) + Math.hypot((n % map.width) - (goal % map.width), Math.floor(n / map.width) - Math.floor(goal / map.width));
        if (score < bestScore) {
          bestScore = score;
          best = n;
        }
      }
    return best;
  }

  /**
   * A swordsman goes out through the gate after a raider outside (raider archers, sappers and ladder
   * crews first) while few enough of the others are out and the odds there aren't too long, and
   * comes back when the raider is down or the odds turn. Returns whether he is out.
   */
  function sortie(u: Unit, here: number): boolean {
    const bs = b as BattleState;
    if (bs.phase !== 'fight') {
      if (u.sortie) out--;
      u.sortie = 0;
      return false;
    }
    let foe = u.sortie ? bs.units.find((f) => f.id === u.sortie && f.hp > 0 && !f.on) : undefined;
    if (foe && !oddsOk(foe, swords.filter((o) => o.sortie && Math.hypot(o.x - (foe as Unit).x, o.y - (foe as Unit).y) <= SIEGE.sortie.around + 2).length)) foe = undefined;
    if (u.sortie && !foe) {
      // Done, or outnumbered: back to the post, and a breather before going out again.
      u.sortie = 0;
      u.path = [];
      u.rest = SIEGE.sortie.rest * simConfig.ticksPerSecond;
      out--;
    }
    if (!foe) {
      if ((u.rest ?? 0) > 0) {
        u.rest = (u.rest ?? 0) - 1;
        return false;
      }
      if (out >= sortieCap) return false;
      const pick = sortieTarget(u);
      if (!pick) {
        u.rest = simConfig.ticksPerSecond;
        return false;
      }
      const t = tileOf(map, pick.x, pick.y);
      const path = findPath(map, here, (i) => i === t, [pick.x, pick.y], der.defendCost, SIEGE.sortie.reach * 1.5);
      if (!path) {
        u.rest = simConfig.ticksPerSecond * 2;
        return false;
      }
      foe = pick;
      u.sortie = pick.id;
      u.path = path;
      u.retry = 15;
      out++;
      // Counted as a sortie when they set out from inside the walls (not when they switch targets outside).
      if (!der.outside[here]) siege.sorties++;
    }
    const there = tileOf(map, foe.x, foe.y);
    if (there === here || (Math.hypot(foe.x - u.x, foe.y - u.y) < 3 && clearWalk(map, here, there, der.defendCost))) {
      move(u, foe.x, foe.y, der.defendCost);
      return true;
    }
    if (u.retry <= 0 || u.path[0] !== here || u.path[u.path.length - 1] !== there) {
      u.path = findPath(map, here, (i) => i === there, [foe.x, foe.y], der.defendCost, SIEGE.sortie.reach * 1.5) ?? [];
      u.retry = 15;
    } else u.retry--;
    const step = u.path[1];
    if (step === undefined) return true;
    move(u, (step % map.width) + u.ox, Math.floor(step / map.width) + u.oy, der.defendCost);
    if (tileOf(map, u.x, u.y) === step) u.path.shift();
    return true;
  }

  /**
   * Sappers walk to the foot of the piece they mean to bring down and dig under it; ladder crews
   * carry their ladder to the foot of a wall low enough to scale and raise it. Returns false when
   * there's nothing for them to do (no spot they can reach), so they fight like any raider.
   */
  function siegeWork(u: Unit, here: number): boolean {
    const bs = b as BattleState;
    const isSapper = u.type === 'sapper';
    if (!isSapper && !(u.type === 'ladderCrew' && u.ladder)) return false;
    const spots = isSapper ? der.sapSpots : der.ladderSpots;
    const field = isSapper ? der.sapField : der.ladderField;
    if (!Number.isFinite(field[here] as number)) return false;
    const pid = spots.get(here);
    if (pid === undefined) {
      const next = downhill(map, field, here, der.attackWalk);
      if (next === null) return false;
      const nx = next % map.width;
      move(u, nx + u.ox * 0.5, (next - nx) / map.width + u.oy * 0.5, der.attackWalk);
      return true;
    }
    const p = bs.pieces[pid] as PieceCombat;
    // Go right up to the foot of it first: the side of the spot next to the piece.
    const next = p.tiles.find((t) => edgeNeighbours(map, t, here)) ?? (p.tiles[0] as number);
    const hx = here % map.width;
    const hy = (here - hx) / map.width;
    const fx = hx + ((next % map.width) - hx) * 0.22 + u.oy * 0.6 * (hy === Math.floor(next / map.width) ? 1 : 0);
    const fy = hy + (Math.floor(next / map.width) - hy) * 0.22 + u.ox * 0.6 * (hx === next % map.width ? 1 : 0);
    if (Math.hypot(u.x - fx, u.y - fy) > 0.05) {
      move(u, fx, fy, der.attackWalk);
      return true;
    }
    if (isSapper) {
      const at = (sappers.get(p.id) ?? 0) + 1;
      if (at > SIEGE.sap.perPiece) return false;
      sappers.set(p.id, at);
      u.act = 'sap';
      u.work = (u.work ?? 0) + DT;
      p.sapFrom ??= seconds;
      p.sap = (p.sap ?? 0) + DT;
      if (p.sap >= (p.sapNeed ?? Infinity)) {
        breach(p, 'sap');
        der = derive(map, bs);
      }
      return true;
    }
    u.act = 'raise';
    u.work = (u.work ?? 0) + DT;
    if (u.work >= SIEGE.ladder.raise) {
      u.work = 0;
      u.ladder = false;
      (bs.ladders ??= []).push({ piece: p.id, tile: here, push: 0, up: true });
      siege.laddersUp++;
      bs.version++;
      der = derive(map, bs);
    }
    return true;
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

  function bs(): BattleState {
    return b as BattleState;
  }

  /** Walk on to the next tile, climb over it by ladder, or batter the piece standing in it. */
  function advance(u: Unit, next: number): void {
    const p = pieceAt(next);
    if (p?.standing && !der.laddered.has(p.id)) {
      if (UNITS[u.type].batter <= 0) return; // archers wait for a way through
      // Only so many can swing at one piece; the rest wait their turn.
      const at = (batterers.get(p.id) ?? 0) + 1;
      if (at > COMBAT.batterersPerPiece) return;
      batterers.set(p.id, at);
      u.act = 'batter';
      p.batterFrom ??= seconds;
      const from = tileOf(map, u.x, u.y);
      if ((p.bridge ?? 0) > 0 && p.bridgeTiles?.includes(from)) {
        // The raised drawbridge takes the blows first, swung at from down in the moat.
        p.bridge = Math.max(0, (p.bridge ?? 0) - UNITS[u.type].batter * DT * SIEGE.drawbridge.batter);
        if (p.bridge <= 0) {
          (bs().stats.siege as SiegeStats).bridgesBroken = ((bs().stats.siege as SiegeStats).bridgesBroken ?? 0) + 1;
          bs().version++;
          der = derive(map, bs());
        }
        return;
      }
      p.hp -= UNITS[u.type].batter * DT * p.batterTaken * gateShare(p, from);
      if (p.hp <= 0) {
        breach(p, 'batter');
        der = derive(map, b as BattleState);
      }
      return;
    }
    const nx = next % map.width;
    const ny = (next - nx) / map.width;
    move(u, nx + u.ox, ny + u.oy, der.attackWalk);
  }

  function breach(p: PieceCombat, cause: 'batter' | 'sap'): void {
    const bs = b as BattleState;
    p.hp = 0;
    p.standing = false;
    p.oilLeft = 0;
    p.breachedAt = seconds;
    p.cause = cause;
    // How many of your archers could reach the raiders at its foot when it fell.
    const foot = bs.units.filter((u) => u.side === 'attacker' && u.hp > 0 && Math.hypot(u.x - p.x, u.y - p.y) < 1.6);
    p.coveredBy = bs.units.filter((u) => u.side === 'defender' && u.hp > 0 && UNITS[u.type].bow && foot.some((f) => Math.hypot(f.x - u.x, f.y - u.y) <= reach(map, bs, u, f))).length;
    for (const u of bs.units) if (u.on === p.id) u.on = 0;
    bs.version++;
    result.pieces = true;
  }

  // The fallen.
  const dead = b.units.filter((u) => u.hp <= 0);
  for (const u of dead) {
    b.stats.lost[u.type]++;
    if (u.type === 'sapper' && (u.work ?? 0) > 0) siege.sappersKilled++;
  }
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
    if (p.cause === 'sap') {
      walls.push({ text: `Undermined: ${p.name} at ${p.x}, ${p.y} came down after ${Math.round((p.breachedAt ?? 0) - (p.sapFrom ?? 0))} seconds of sappers digging under it.`, cls: 'bad' });
      walls.push({ text: sapWhy(s, p), cls: 'dim' });
      continue;
    }
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

  const siegeLines = siegeReport(b);
  if (siegeLines.length > 0) sections.push({ title: 'Sappers, ladders and sorties', lines: siegeLines });

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

/** What the sappers, ladder crews and your sorties did, in plain words. */
function siegeReport(b: BattleState): ReportLine[] {
  const st = b.stats;
  const sg = st.siege;
  const lines: ReportLine[] = [];
  if (!sg) return lines;
  const sappers = st.start.sapper;
  const sapped = Object.values(b.pieces).filter((p) => p.cause === 'sap').length;
  if (sappers > 0) {
    const dug = Object.values(b.pieces).filter((p) => (p.sap ?? 0) > 0 && p.cause !== 'sap');
    if (sapped > 0) lines.push({ text: `Sappers brought down ${plural(sapped, 'piece', 'pieces')} by digging under ${sapped === 1 ? 'it' : 'them'}.`, cls: 'bad' });
    for (const p of dug.slice(0, 2))
      lines.push({ text: `Sappers dug under the ${p.name.toLowerCase()} at ${p.x}, ${p.y} for ${Math.round(p.sap ?? 0)} of the ${Math.round(p.sapNeed ?? 0)} seconds it needed before they were stopped.`, cls: 'warn' });
    if (sg.sappersKilled > 0) lines.push({ text: `${plural(sg.sappersKilled, 'sapper was', 'sappers were')} killed at work, under their timber shelters (they're hit half as often while digging).`, cls: 'good' });
    if (sapped === 0 && dug.length === 0)
      lines.push(
        sg.sapSpots === 0
          ? { text: `The ${plural(sappers, 'sapper', 'sappers')} found nowhere to dig: everything they could reach stands on rock or behind a moat.`, cls: 'good' }
          : { text: `The ${plural(sappers, 'sapper', 'sappers')} never got to dig: they were cut down on the way in.`, cls: 'good' },
      );
    else lines.push({ text: 'Sappers can\'t dig through rock or across a moat. Round towers take half as long again; oil cauldrons and sorties reach them at the foot.', cls: 'dim' });
  }
  const crews = st.start.ladderCrew;
  if (crews > 0) {
    if (sg.laddersUp === 0)
      lines.push(
        sg.ladderSpots === 0
          ? { text: `The ${plural(crews, 'ladder crew', 'ladder crews')} found no wall low enough to climb: a ladder reaches one level above the ground at the foot, and can't stand in a moat.`, cls: 'good' }
          : { text: `The ${plural(crews, 'ladder crew', 'ladder crews')} never got a ladder up: they were cut down on the way in.`, cls: 'good' },
      );
    else {
      lines.push({
        text: `Ladder crews raised ${plural(sg.laddersUp, 'ladder', 'ladders')}; ${sg.laddersPushed} ${sg.laddersPushed === 1 ? 'was' : 'were'} pushed away, and ${plural(sg.climbed, 'raider', 'raiders')} climbed onto your walls.`,
        cls: sg.climbed > 0 ? 'bad' : 'good',
      });
      lines.push({ text: 'Soldiers on a wall push ladders away; a High wall, a Medium wall on a mound, or a moat at its foot can\'t be laddered at all.', cls: 'dim' });
    }
  }
  if (sg.sorties > 0) lines.push({ text: `Your swordsmen went out through the gate ${plural(sg.sorties, 'time', 'times')} after raiders outside.`, cls: 'good' });
  if (sg.lobbed > 0) lines.push({ text: `${plural(sg.lobbed, 'arrow was', 'arrows were')} lobbed high over walls in the way, hitting half as often.`, cls: 'dim' });
  return lines;
}

function sapWhy(s: SimState, p: PieceCombat): string {
  const parts: string[] = [];
  const piece = s.plan.pieces.find((q) => q.id === p.id) as Piece | undefined;
  if (piece?.kind === 'wall' && piece.thickness !== 'thick') parts.push(`A thick wall takes ${SIEGE.sap.thickness.thick / SIEGE.sap.thickness[piece.thickness]}× as long to undermine.`);
  if (piece?.kind === 'tower' && piece.shape === 'square') parts.push('A round tower takes half as long again.');
  parts.push('A moat along its foot, or rock under it, would have kept the sappers off.');
  if (p.coveredBy === 0) parts.push('None of your archers could reach the foot of it.');
  return parts.join(' ');
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
