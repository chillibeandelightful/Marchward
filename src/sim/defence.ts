import { COMBAT, RAIDER_TYPES, RAIDS, TROOP_TYPES, UNITS, type RaiderType, type TroopType } from '../data/combat';
import { isWinter } from './calendar';
import type { BattleReport, BattleState } from './battle';
import { footprint, type CastlePlan, type Piece, type PieceKind } from './castle';
import type { EconomyState } from './economy';
import type { Rng } from './rng';
import { inBounds, terrainAt, type TerrainMap } from './terrain';

/** A map edge raiders can come from, named by where it lies on screen. */
export type Edge = 'north-west' | 'north-east' | 'south-east' | 'south-west';
export const EDGES: readonly Edge[] = ['north-west', 'north-east', 'south-east', 'south-west'];

/** Where the player wants a soldier to stand when a battle starts. */
export interface Post {
  type: TroopType;
  x: number;
  y: number;
}

/** Raids and the garrison's posts. Plain data, so it goes into saves. */
export interface DefenceState {
  /** Off for practice. */
  raids: boolean;
  /** Day the next raid arrives. */
  nextRaid: number;
  /** Which edge it comes from. Chosen again when the scouts report it, from where the castle looks weakest. */
  from: Edge;
  /** The edge the last raid came from (missing before M6), so the next one tends to come from elsewhere. */
  lastFrom?: Edge | null;
  /** Raids fought so far. */
  raidCount: number;
  warned: boolean;
  posts: Post[];
  battle: BattleState | null;
  /** The most recent battle reports, newest last. */
  reports: BattleReport[];
}

const REPORTS_KEPT = 8;

export function createDefence(rng: Rng): DefenceState {
  return {
    raids: true,
    nextRaid: RAIDS.firstDay + rng.int(0, RAIDS.firstJitter),
    from: rng.pick(EDGES),
    raidCount: 0,
    warned: false,
    posts: [],
    battle: null,
    reports: [],
  };
}

/** Pick the next raid's day (never in winter) and direction, `gap` days or so after `day`. */
export function scheduleRaid(d: DefenceState, rng: Rng, day: number): void {
  let next = day + rng.int(RAIDS.gap[0], RAIDS.gap[1]);
  // Raiders sit out the winter; they come some time in the spring instead.
  if (isWinter(next)) {
    while (isWinter(next)) next++;
    next += rng.int(10, 40);
  }
  d.nextRaid = next;
  d.from = rng.pick(EDGES);
  d.warned = false;
}

export function addReport(d: DefenceState, report: BattleReport): void {
  d.reports.push(report);
  if (d.reports.length > REPORTS_KEPT) d.reports.splice(0, d.reports.length - REPORTS_KEPT);
}

/** How many of each raider the next raid (number raidCount + 1) brings. */
export function raidStrength(raidNumber: number): Record<RaiderType, number> {
  const n = Math.max(1, raidNumber);
  return Object.fromEntries(
    RAIDER_TYPES.map((t) => {
      const { base, perRaid, from } = RAIDS.strength[t];
      return [t, n < from ? 0 : Math.floor(base + perRaid * (n - from))];
    }),
  ) as Record<RaiderType, number>;
}

export function describeStrength(s: Record<RaiderType, number>): string {
  const parts = RAIDER_TYPES.filter((t) => s[t] > 0).map((t) => `${s[t]} ${(s[t] === 1 ? UNITS[t].name : UNITS[t].plural).toLowerCase()}`);
  return parts.length <= 1 ? (parts[0] ?? 'nobody') : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

function pieceOn(plan: CastlePlan, x: number, y: number): Piece | null {
  return plan.pieces.find((p) => footprint(p).some(([px, py]) => px === x && py === y)) ?? null;
}

/** How many soldiers fit on a tile: archers on a piece by its kind, anyone on open ground. */
export function postCapacity(kind: PieceKind | 'ground'): number {
  return COMBAT.postCapacity[kind];
}

export function postsAt(d: DefenceState, x: number, y: number, type?: TroopType): Post[] {
  return d.posts.filter((p) => p.x === x && p.y === y && (!type || p.type === type));
}

/** Most posts of a kind worth keeping: one per soldier you have or want. */
export function postLimit(e: EconomyState, type: TroopType): number {
  return Math.max(e.troops[type], e.troopsWanted[type]);
}

/** Why a soldier can't be posted here, or null if they can. */
export function postProblem(map: TerrainMap, plan: CastlePlan, e: EconomyState, d: DefenceState, type: TroopType, x: number, y: number): string | null {
  if (!inBounds(map, x, y)) return 'Off the edge of the map';
  const piece = pieceOn(plan, x, y);
  if (piece && type === 'swordsman') return 'Swordsmen fight on the ground; post archers on walls and towers';
  if (!piece && terrainAt(map, x, y).moveCost === null) return 'Nobody can stand in deep water';
  const here = piece ? d.posts.filter((p) => piece && footprint(piece).some(([px, py]) => p.x === px && p.y === py)) : postsAt(d, x, y);
  const cap = postCapacity(piece ? piece.kind : 'ground');
  if (here.length >= cap) return `Full: ${cap} ${cap === 1 ? 'soldier fits' : 'soldiers fit'} here`;
  const limit = postLimit(e, type);
  if (d.posts.filter((p) => p.type === type).length >= limit)
    return `All ${limit} ${UNITS[type].plural.toLowerCase()} have posts (hire more in the Defence tab)`;
  return null;
}

export function addPost(map: TerrainMap, plan: CastlePlan, e: EconomyState, d: DefenceState, type: TroopType, x: number, y: number): string | null {
  const problem = postProblem(map, plan, e, d, type, x, y);
  if (problem) return problem;
  d.posts.push({ type, x, y });
  return null;
}

/** Take one soldier of a kind (or any kind) off a tile. Returns whether one was removed. */
export function removePost(d: DefenceState, x: number, y: number, type?: TroopType): boolean {
  for (let i = d.posts.length - 1; i >= 0; i--) {
    const p = d.posts[i] as Post;
    if (p.x === x && p.y === y && (!type || p.type === type)) {
      d.posts.splice(i, 1);
      return true;
    }
  }
  return false;
}

/** Posts beyond what the garrison can fill are kept (soldiers may be on their way), but counted for the panel. */
export function postCounts(e: EconomyState, d: DefenceState): Record<TroopType, { posted: number; have: number }> {
  return Object.fromEntries(
    TROOP_TYPES.map((t) => [t, { posted: d.posts.filter((p) => p.type === t).length, have: e.troops[t] }]),
  ) as Record<TroopType, { posted: number; have: number }>;
}
