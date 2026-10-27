import type { Graphics } from 'pixi.js';
import { UNITS, type TroopType, type UnitType } from '../data/combat';
import { simConfig } from '../data/config';
import { unitLevel, type BattleState, type Unit } from '../sim/battle';
import { footprint, pieceLevels } from '../sim/castle';
import { postCapacity } from '../sim/defence';
import type { SimState } from '../sim/state';
import { heightAt } from '../sim/terrain';
import { pieceProgress } from '../sim/works';
import { isoToScreen } from './iso';
import type { ActorHost } from './workersArt';

/** The player's colours on tabards, and the raiders' drab ones. */
const TABARD = 0xb3342a;
const HELM = 0x9a9a9a;
const RAIDER = 0x5a5236;
const HOOD = 0x2e2a22;
const SKIN = 0xe0b48c;
const LEGS = 0x3b3127;
const STEEL = 0xd8d8d8;
const WOOD = 0x6b4a2a;

/**
 * Soldiers, raiders, arrows in flight and boiling oil, drawn from the battle state; and, in peacetime,
 * the garrison standing at its posts. Purely visual: reads the sim, never changes it.
 */
export function drawBattle(host: ActorHost, sim: SimState, alpha: number, timeMs: number): void {
  const b = sim.defence.battle;
  const t = timeMs / 1000;
  if (!b) {
    drawGarrison(host, sim, t);
    return;
  }
  for (const u of b.units) drawUnit(host, sim, b, u, t);
  drawPieceHealth(host, sim, b);
  const now = b.tick + alpha;
  for (const a of b.arrows) {
    const k = Math.min(1, Math.max(0, (now - a.fired) / Math.max(1, a.arrive - a.fired)));
    const x = a.x0 + (a.x1 - a.x0) * k;
    const y = a.y0 + (a.y1 - a.y0) * k;
    const dist = Math.hypot(a.x1 - a.x0, a.y1 - a.y0);
    const arc = Math.sin(k * Math.PI) * Math.min(1.5, dist * 0.18);
    const level = a.l0 + (a.l1 - a.l0) * k + arc;
    const g = host.layer(Math.round(x) + Math.round(y));
    if (!g) continue;
    const p = isoToScreen(x, y, level);
    const ahead = isoToScreen(a.x0 + (a.x1 - a.x0) * Math.min(1, k + 0.05), a.y0 + (a.y1 - a.y0) * Math.min(1, k + 0.05), level + Math.cos(k * Math.PI) * 0.15);
    const dx = ahead.sx - p.sx;
    const dy = ahead.sy - p.sy;
    const len = Math.max(0.001, Math.hypot(dx, dy));
    g.moveTo(p.sx - (dx / len) * 4, p.sy - (dy / len) * 4)
      .lineTo(p.sx + (dx / len) * 4, p.sy + (dy / len) * 4)
      .stroke({ width: 1.2, color: a.side === 'defender' ? 0x3a2a1a : 0x1a1a1a, alpha: 0.9 });
  }
  for (const sp of b.splashes) {
    const age = (now - sp.tick) / (simConfig.ticksPerSecond * 1.5);
    const g = host.layer(sp.x + sp.y + 1);
    const pc = Object.values(b.pieces).find((p) => p.x === sp.x && p.y === sp.y);
    if (!g || !pc) continue;
    const top = isoToScreen(sp.x, sp.y, pc.ground + pc.levels);
    const base = isoToScreen(sp.x, sp.y, host.ground(sp.x, sp.y));
    // A sheet of oil down the face, then a steaming pool at the foot.
    g.rect(top.sx - 4, top.sy, 8, Math.max(0, base.sy - top.sy) * Math.min(1, age * 3)).fill({ color: 0x3a2410, alpha: 0.8 * (1 - age) });
    g.ellipse(base.sx, base.sy + 6, 20 * (0.5 + age), 9 * (0.5 + age)).fill({ color: 0x5a3a14, alpha: 0.65 * (1 - age) });
    g.ellipse(base.sx, base.sy + 2 - age * 20, 10 + age * 10, 4 + age * 4).fill({ color: 0xe8e2d0, alpha: 0.25 * (1 - age) });
  }
}

/** Diagonal row a figure is drawn with: its own tile's, or the front of the piece it stands on (so the piece doesn't cover it). */
function rowFor(sim: SimState, x: number, y: number, piece?: { tiles: number[] }): number {
  if (!piece) return Math.round(x) + Math.round(y);
  return Math.max(...piece.tiles.map((i) => (i % sim.map.width) + Math.floor(i / sim.map.width)));
}

function drawUnit(host: ActorHost, sim: SimState, b: BattleState, u: Unit, t: number): void {
  const g = host.layer(rowFor(sim, u.x, u.y, u.on ? b.pieces[u.on] : undefined));
  if (!g) return;
  const level = u.on ? unitLevel(sim.map, b, u) : host.ground(u.x, u.y);
  const p = isoToScreen(u.x, u.y, level);
  drawSoldier(g, p.sx, p.sy, u.type, u.act, t + u.id * 0.37, u.hp / UNITS[u.type].hp, u.side === 'defender' && u.on !== 0);
}

/** A soldier or raider. `act` sets the pose; a bar shows wounds. */
export function drawSoldier(
  g: Graphics,
  sx: number,
  sy: number,
  type: UnitType,
  act: Unit['act'],
  t: number,
  health: number,
  onWall = false,
): void {
  const defender = UNITS[type].side === 'defender';
  const archer = !!UNITS[type].bow;
  const walking = act === 'walk';
  const step = walking ? Math.sin(t * 9) * 1.4 : 0;
  if (!onWall) g.ellipse(sx, sy, 3.5, 1.5).fill({ color: 0x000000, alpha: 0.25 });
  g.moveTo(sx - 1.2, sy).lineTo(sx - 1.2 + step, sy - 4).moveTo(sx + 1.2, sy).lineTo(sx + 1.2 - step, sy - 4).stroke({ width: 1.3, color: LEGS });
  const top = sy - 10.5;
  g.rect(sx - 2.4, top, 4.8, 7).fill(defender ? TABARD : RAIDER);
  if (defender) g.rect(sx - 2.4, top + 2.5, 4.8, 1).fill({ color: 0xe8e2d0, alpha: 0.7 });
  g.circle(sx, top - 2, 1.9).fill(SKIN);
  // Helmet for the garrison, a hood for raiders.
  if (defender) g.rect(sx - 2.1, top - 4.3, 4.2, 2).fill(HELM);
  else g.poly([sx - 2.4, top - 1.5, sx, top - 5, sx + 2.4, top - 1.5]).fill(HOOD);

  if (archer) {
    // The bow: drawn when shooting, held otherwise.
    const draw = act === 'shoot' ? (Math.sin(t * 3) + 1) * 1.2 : 0;
    const bx = sx + 3.5;
    const by = top + 2;
    g.moveTo(bx, by - 5).quadraticCurveTo(bx + 3, by, bx, by + 5).stroke({ width: 1, color: WOOD });
    g.moveTo(bx, by - 5).lineTo(bx - draw, by).lineTo(bx, by + 5).stroke({ width: 0.5, color: 0xe8e2d0, alpha: 0.8 });
  } else {
    // Sword (or axe for raiders) swung when fighting or battering; a small shield for the garrison.
    const busy = act === 'fight' || act === 'batter' || act === 'loot';
    const swing = busy ? Math.sin(t * (act === 'batter' ? 6 : 8)) : -0.3;
    const hx = sx + 2.4;
    const hy = top + 2;
    const ang = -1.1 + swing * 0.9;
    const ex = hx + Math.cos(ang) * 6;
    const ey = hy + Math.sin(ang) * 6;
    g.moveTo(hx, hy).lineTo(ex, ey).stroke({ width: 1.2, color: defender ? STEEL : 0x8c8c8c });
    if (!defender) g.rect(ex - 1.5, ey - 1.5, 3, 2.5).fill(0x6f6f6f);
    if (defender) g.ellipse(sx - 2.8, top + 3.5, 1.8, 2.6).fill(0x6b4a2a).stroke({ width: 0.6, color: STEEL });
  }
  if (health < 0.999) {
    g.rect(sx - 4, top - 8, 8, 1.6).fill({ color: 0x000000, alpha: 0.6 });
    g.rect(sx - 4, top - 8, 8 * Math.max(0, health), 1.6).fill(health > 0.5 ? 0x9fd98b : health > 0.25 ? 0xf0c56a : 0xf08a72);
  }
}

/** A thin bar over each damaged piece: how much it has left. */
function drawPieceHealth(host: ActorHost, sim: SimState, b: BattleState): void {
  for (const p of Object.values(b.pieces)) {
    if (!p.standing || p.hp >= p.max - 0.5) continue;
    const front = Math.max(...p.tiles.map((i) => (i % sim.map.width) + Math.floor(i / sim.map.width)));
    const g = host.layer(front);
    if (!g) continue;
    const cx = p.kind === 'keep' ? p.x + 0.5 : p.x;
    const cy = p.kind === 'keep' ? p.y + 0.5 : p.y;
    const s = isoToScreen(cx, cy, p.ground + p.levels + 0.8);
    const frac = Math.max(0, p.hp / p.max);
    g.rect(s.sx - 14, s.sy - 3, 28, 4).fill({ color: 0x000000, alpha: 0.65 });
    g.rect(s.sx - 13, s.sy - 2, 26 * frac, 2).fill(frac > 0.5 ? 0xd9d2c0 : frac > 0.25 ? 0xf0c56a : 0xf08a72);
  }
}

/**
 * In peacetime the garrison stands at its posts (as many posts as there are soldiers to fill them),
 * so you can see where everyone will be when raiders come.
 */
function drawGarrison(host: ActorHost, sim: SimState, t: number): void {
  const left: Record<TroopType, number> = { ...sim.economy.troops };
  const used = new Map<string, number>();
  for (const post of sim.defence.posts) {
    if (left[post.type] <= 0) continue;
    left[post.type]--;
    const key = `${post.x},${post.y}`;
    const n = used.get(key) ?? 0;
    used.set(key, n + 1);
    const piece = sim.plan.pieces.find((p) => footprint(p).some(([x, y]) => x === post.x && y === post.y));
    const built = piece && pieceProgress(sim.map, sim.works, piece) >= 0.5;
    const cap = postCapacity(piece && built ? piece.kind : 'ground');
    const a = (n / Math.max(1, cap)) * Math.PI * 2;
    const r = n === 0 ? 0 : 0.22;
    const x = post.x + Math.cos(a) * r;
    const y = post.y + Math.sin(a) * r;
    const tiles = piece && built ? footprint(piece).map(([px, py]) => py * sim.map.width + px) : undefined;
    const g = host.layer(rowFor(sim, post.x, post.y, tiles ? { tiles } : undefined));
    if (!g) continue;
    let level = host.ground(x, y);
    if (piece && built) {
      const progress = pieceProgress(sim.map, sim.works, piece);
      const levels = progress >= 1 ? pieceLevels(piece) : Math.max(1, Math.round(pieceLevels(piece) * progress));
      level = Math.max(...footprint(piece).map(([px, py]) => heightAt(sim.map, px, py))) + levels;
    }
    const p = isoToScreen(x, y, level);
    drawSoldier(g, p.sx, p.sy, post.type, 'stand', t + n, 1, !!(piece && built));
  }
}
