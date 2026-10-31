import type { Graphics } from 'pixi.js';
import { shade } from './terrainStyle';
import { SIEGE, UNITS, type TroopType, type UnitType } from '../data/combat';
import { simConfig } from '../data/config';
import type { BattleState, Unit } from '../sim/battle';
import { footprint, pieceLevels } from '../sim/castle';
import { postCapacity } from '../sim/defence';
import type { SimState } from '../sim/state';
import { heightAt } from '../sim/terrain';
import { pieceProgress } from '../sim/works';
import { drawnLevels, isoToScreen } from './iso';
import { drawArt, frameAt, paintedFrames, type Pose } from './paintedArt';
import { groundShadow } from './lighting';
import { style } from './styles';
import { drawBattleFire, drawBreachSmoke, drawDust } from './effectsArt';
import type { ActorHost } from './workersArt';

/**
 * Soldiers, raiders, arrows in flight, boiling oil, and the fire and smoke of the fighting, drawn from the
 * battle state; and, in peacetime, the garrison standing at its posts. Purely visual: reads the sim, never changes it.
 * `sky` is a layer over everything, for smoke that rises above the walls.
 */
export function drawBattle(host: ActorHost, sim: SimState, alpha: number, timeMs: number, sky?: Graphics): void {
  const b = sim.defence.battle;
  const t = timeMs / 1000;
  if (!b) {
    drawGarrison(host, sim, t);
    return;
  }
  drawSiegeWorks(host, sim, b);
  for (const u of b.units) drawUnit(host, sim, b, u, t);
  drawPieceHealth(host, sim, b);
  drawOpenGates(host, sim, b);
  drawDust(host, b, t);
  drawBreachSmoke(host, sim, b, t, sky);
  drawBattleFire(host, sim, b, t, sky);
  const fx = style().effects;
  const now = b.tick + alpha;
  for (const a of b.arrows) {
    const k = Math.min(1, Math.max(0, (now - a.fired) / Math.max(1, a.arrive - a.fired)));
    const x = a.x0 + (a.x1 - a.x0) * k;
    const y = a.y0 + (a.y1 - a.y0) * k;
    const dist = Math.hypot(a.x1 - a.x0, a.y1 - a.y0);
    // A lob over a wall goes up high; an ordinary shot only arcs a little.
    const arc = Math.sin(k * Math.PI) * (a.lob ? Math.min(4.5, 1.5 + dist * 0.35) : Math.min(1.5, dist * 0.18));
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
      .stroke({ width: 1.2 * style().figures.scale, color: a.side === 'defender' ? 0x3a2a1a : 0x1a1a1a, alpha: 0.9 });
  }
  for (const sp of b.splashes) {
    const age = (now - sp.tick) / (simConfig.ticksPerSecond * 1.5);
    const g = host.layer(sp.x + sp.y + 1);
    const pc = Object.values(b.pieces).find((p) => p.x === sp.x && p.y === sp.y);
    if (!g || !pc) continue;
    const top = isoToScreen(sp.x, sp.y, pc.ground + drawnLevels(pc.levels, pc.kind));
    const base = isoToScreen(sp.x, sp.y, host.ground(sp.x, sp.y));
    // A sheet of oil down the face, then a steaming pool at the foot.
    g.rect(top.sx - 4, top.sy, 8, Math.max(0, base.sy - top.sy) * Math.min(1, age * 3)).fill({ color: fx.oil, alpha: 0.8 * (1 - age) });
    g.ellipse(base.sx, base.sy + 6, 20 * (0.5 + age), 9 * (0.5 + age)).fill({ color: shade(fx.oil, 1.5), alpha: 0.65 * (1 - age) });
    g.ellipse(base.sx, base.sy + 2 - age * 20, 10 + age * 10, 4 + age * 4).fill({ color: fx.steam, alpha: 0.3 * (1 - age) });
  }
}

/** Diagonal row a figure is drawn with: its own tile's, or the front of the piece it stands on (so the piece doesn't cover it). */
function rowFor(sim: SimState, x: number, y: number, piece?: { tiles: number[] }): number {
  if (!piece) return Math.round(x) + Math.round(y);
  return Math.max(...piece.tiles.map((i) => (i % sim.map.width) + Math.floor(i / sim.map.width)));
}

/** Which way each unit last moved on screen, so painted figures face where they're going. */
const facing = new Map<number, { sx: number; left: boolean }>();

function facesLeft(id: number, sx: number): boolean {
  const was = facing.get(id);
  // Start facing either way, then follow the walk; small jitters don't turn them round.
  const left = !was ? id % 2 === 1 : Math.abs(sx - was.sx) > 0.05 ? sx < was.sx : was.left;
  facing.set(id, { sx, left });
  return left;
}

function drawUnit(host: ActorHost, sim: SimState, b: BattleState, u: Unit, t: number): void {
  const g = host.layer(rowFor(sim, u.x, u.y, u.on ? b.pieces[u.on] : undefined));
  if (!g) return;
  const on = u.on ? b.pieces[u.on] : undefined;
  const level = on ? on.ground + drawnLevels(on.levels, on.kind) : host.ground(u.x, u.y);
  const p = isoToScreen(u.x, u.y, level);
  const left = facesLeft(u.id, p.sx);
  const sc = style().figures.scale;
  if (u.type === 'sapper' && u.act === 'sap') drawSpoil(g, p.sx, p.sy, Math.min(1, (u.work ?? 0) / 30), sc);
  drawSoldier(g, p.sx, p.sy, u.type, u.act, t + u.id * 0.37, u.hp / UNITS[u.type].hp, u.on !== 0, left);
  if (u.type === 'ladderCrew' && u.ladder) drawCarriedLadder(g, p.sx, p.sy, u.act === 'raise' ? Math.min(1, (u.work ?? 0) / SIEGE.ladder.raise) : 0, left, sc);
  if (u.type === 'sapper' && u.act === 'sap') drawShelter(g, p.sx, p.sy, sc);
}

const LADDER_WOOD = 0x7a5530;
const LADDER_INK = 0x2a1c10;

/** A ladder from one screen point to another: two rails and rungs. */
function drawLadder(g: Graphics, ax: number, ay: number, bx: number, by: number, width: number): void {
  const dx = bx - ax;
  const dy = by - ay;
  const len = Math.max(1, Math.hypot(dx, dy));
  // Rails either side, square to the ladder's length on screen.
  const nx = (-dy / len) * width;
  const ny = (dx / len) * width;
  const rail = (s: number) => g.moveTo(ax + nx * s, ay + ny * s).lineTo(bx + nx * s, by + ny * s);
  rail(-1).stroke({ width: 2.6, color: LADDER_INK });
  rail(1).stroke({ width: 2.6, color: LADDER_INK });
  rail(-1).stroke({ width: 1.3, color: LADDER_WOOD });
  rail(1).stroke({ width: 1.3, color: LADDER_WOOD });
  for (let d = 5; d < len - 2; d += 5) {
    const px = ax + (dx * d) / len;
    const py = ay + (dy * d) / len;
    g.moveTo(px - nx, py - ny).lineTo(px + nx, py + ny).stroke({ width: 1, color: shade(LADDER_WOOD, 1.15) });
  }
}

/** A ladder crew's ladder: over the shoulder on the march, swung up as they raise it. */
function drawCarriedLadder(g: Graphics, sx: number, sy: number, raised: number, left: boolean, sc: number): void {
  const dir = left ? -1 : 1;
  const angle = 0.15 + raised * 1.1;
  const len = 26 * sc;
  const hx = sx;
  const hy = sy - 13 * sc;
  const back = { x: hx - dir * Math.cos(angle) * len * 0.45, y: hy + Math.sin(angle) * len * 0.45 };
  const front = { x: hx + dir * Math.cos(angle) * len * 0.55, y: hy - Math.sin(angle) * len * 0.55 };
  drawLadder(g, back.x, back.y, front.x, front.y, 2.2 * sc);
}

/** The timber shelter a sapper digs under, to keep arrows off. */
function drawShelter(g: Graphics, sx: number, sy: number, sc: number): void {
  const w = 10 * sc;
  const roof = [sx - w, sy - 5 * sc, sx - w * 0.7, sy - 16 * sc, sx + w * 0.8, sy - 13 * sc, sx + w, sy - 3 * sc];
  g.poly(roof).fill(0x6a4a2a).stroke({ width: 1.2, color: LADDER_INK });
  for (let i = 1; i < 4; i++) {
    const k = i / 4;
    g.moveTo(sx - w + k * 2 * w, sy - 5 * sc + k * 2 * sc).lineTo(sx - w * 0.7 + k * 1.5 * w, sy - 16 * sc + k * 3 * sc).stroke({ width: 0.8, color: 0x4a321c });
  }
  // Posts down to the ground at the corners.
  g.moveTo(sx - w, sy - 5 * sc).lineTo(sx - w, sy).moveTo(sx + w, sy - 3 * sc).lineTo(sx + w, sy + 1).stroke({ width: 1.4, color: LADDER_INK });
}

/** The heap of earth a sapper has dug out, growing as he goes. */
function drawSpoil(g: Graphics, sx: number, sy: number, grown: number, sc: number): void {
  const r = (4 + grown * 7) * sc;
  g.ellipse(sx - 8 * sc, sy + 2, r, r * 0.45).fill({ color: 0x4b3a26, alpha: 0.95 });
  g.ellipse(sx - 9 * sc, sy + 1, r * 0.6, r * 0.25).fill({ color: 0x6a5236, alpha: 0.9 });
}

/** Ladders against the walls (or lying where they were pushed away), and cracks where sappers are digging. */
function drawSiegeWorks(host: ActorHost, sim: SimState, b: BattleState): void {
  const w = sim.map.width;
  for (const l of b.ladders ?? []) {
    const pc = b.pieces[l.piece];
    if (!pc) continue;
    const fx = l.tile % w;
    const fy = Math.floor(l.tile / w);
    // The piece tile the ladder leans on: the one next to its foot.
    const lean = pc.tiles.find((i) => Math.abs((i % w) - fx) + Math.abs(Math.floor(i / w) - fy) === 1) ?? pc.tiles[0] ?? l.tile;
    const tx = lean % w;
    const ty = Math.floor(lean / w);
    const dx = tx - fx;
    const dy = ty - fy;
    const g = host.layer(fx + fy);
    if (!g) continue;
    const sc = style().figures.scale;
    if (l.up && pc.standing) {
      const foot = isoToScreen(fx + dx * 0.05, fy + dy * 0.05, host.ground(fx, fy));
      const top = isoToScreen(tx - dx * 0.42, ty - dy * 0.42, pc.ground + drawnLevels(pc.levels, pc.kind) + 0.25);
      drawLadder(g, foot.sx, foot.sy, top.sx, top.sy, 2.4 * sc);
    } else {
      const a = isoToScreen(fx - dx * 0.1, fy - dy * 0.1, host.ground(fx, fy));
      const c = isoToScreen(fx - dx * 1.1, fy - dy * 1.1, host.ground(fx - dx, fy - dy));
      drawLadder(g, a.sx, a.sy, c.sx, c.sy, 2.4 * sc);
    }
  }
  for (const pc of Object.values(b.pieces)) {
    if (!pc.standing || !(pc.sap ?? 0) || !pc.sapNeed) continue;
    const frac = Math.min(1, (pc.sap ?? 0) / pc.sapNeed);
    const front = Math.max(...pc.tiles.map((i) => (i % w) + Math.floor(i / w)));
    const g = host.layer(front);
    if (!g) continue;
    // A crack running up the face from the foot as the ground under it is dug away.
    const height = drawnLevels(pc.levels, pc.kind) * frac;
    let prev = isoToScreen(pc.x + 0.3, pc.y + 0.47, pc.ground);
    for (let k = 1; k <= 6; k++) {
      const lv = pc.ground + (height * k) / 6;
      const zig = (k % 2 === 0 ? 1 : -1) * 0.07;
      const p = isoToScreen(pc.x + 0.3 + zig, pc.y + 0.47, lv);
      g.moveTo(prev.sx, prev.sy).lineTo(p.sx, p.sy).stroke({ width: 1.6, color: 0x1a1612, alpha: 0.85 });
      prev = p;
    }
  }
}

/** A gatehouse drawn open for a moment as soldiers go through: the passage dark, the portcullis up. */
function drawOpenGates(host: ActorHost, sim: SimState, b: BattleState): void {
  for (const pc of Object.values(b.pieces)) {
    if (pc.kind !== 'gatehouse' || !pc.standing || (pc.openUntil ?? 0) <= b.tick) continue;
    const piece = sim.plan.pieces.find((p) => p.id === pc.id);
    if (!piece || piece.kind !== 'gatehouse') continue;
    const g = host.layer(pc.x + pc.y);
    if (!g) continue;
    const ground = pc.ground;
    const w = 0.2;
    const spring = ground + 1;
    const along = (u: number, lv: number) => {
      const p = piece.axis === 'x' ? isoToScreen(pc.x + 0.47, pc.y + u, lv) : isoToScreen(pc.x + u, pc.y + 0.47, lv);
      return [p.sx, p.sy];
    };
    const pts: number[] = [...along(-w, ground), ...along(-w, spring)];
    for (let i = 1; i < 8; i++) {
      const a = Math.PI - (i / 8) * Math.PI;
      pts.push(...along(w * Math.cos(a), spring + 0.45 * Math.sin(a)));
    }
    pts.push(...along(w, spring), ...along(w, ground));
    g.poly(pts).fill(0x0c0a08);
    // The portcullis drawn up into the arch: just its spikes showing.
    for (let i = -2; i <= 2; i++) {
      const [ax, ay] = along((i * w) / 2.5, spring + 0.25) as [number, number];
      const [bx, by] = along((i * w) / 2.5, spring + 0.42) as [number, number];
      g.moveTo(ax, ay).lineTo(bx, by).stroke({ width: 1, color: 0x6b5a40, alpha: 0.9 });
    }
  }
}

/** A soldier or raider. `act` sets the pose; a bar shows wounds. Drawn at the active style's size and colours. */
export function drawSoldier(
  g: Graphics,
  sx: number,
  sy: number,
  type: UnitType,
  act: Unit['act'],
  t: number,
  health: number,
  onWall = false,
  left = false,
): void {
  // Digging under a wall and raising a ladder use the fighting frames (a swing of the pick or the arms).
  const pose: Pose = act === 'walk' ? 'walk' : act === 'shoot' ? 'shoot' : act === 'stand' ? 'stand' : UNITS[type].bow ? 'stand' : 'fight';
  const painted = paintedFrames(`${type}.${pose}`);
  if (painted) {
    if (!onWall) groundShadow(g, sx, sy, 4.5, 1.8, 20);
    drawArt(g, frameAt(painted, t, pose === 'walk' ? 5 : act === 'batter' ? 4 : 6), sx, sy, { flip: left });
    if (health < 0.999) {
      g.rect(sx - 5, sy - 25, 10, 1.6).fill({ color: 0x000000, alpha: 0.6 });
      g.rect(sx - 5, sy - 25, 10 * Math.max(0, health), 1.6).fill(health > 0.5 ? 0x9fd98b : health > 0.25 ? 0xf0c56a : 0xf08a72);
    }
    return;
  }
  const f = style().figures;
  const defender = UNITS[type].side === 'defender';
  const archer = !!UNITS[type].bow;
  const walking = act === 'walk';
  // An unhurried stride to match the walking pace.
  const step = walking ? Math.sin(t * 4.5) * 1.4 : 0;
  // Drawn round (0, 0) at the feet, scaled up for chunkier figures.
  g.setTransform(f.scale, 0, 0, f.scale, sx, sy);
  if (!onWall) groundShadow(g, 0, 0, 3.5, 1.5, 12 / f.scale);
  const top = -10.5;
  const body = defender ? f.tabard : f.raider;
  if (f.outline !== null) {
    // A dark silhouette a little bigger than the figure, so it stands out from the ground.
    const ink = { width: 2.6, color: f.outline, cap: 'round' } as const;
    g.moveTo(-1.2, 0).lineTo(-1.2 + step, -4).moveTo(1.2, 0).lineTo(1.2 - step, -4).stroke(ink);
    g.rect(-3.1, top - 0.7, 6.2, 8.4).fill(f.outline);
    g.circle(0, top - 2, 2.6).fill(f.outline);
    if (defender) g.rect(-2.8, top - 5, 5.6, 3.2).fill(f.outline);
    else g.poly([-3.3, top - 1, 0, top - 6.2, 3.3, top - 1]).fill(f.outline);
  }
  g.moveTo(-1.2, 0).lineTo(-1.2 + step, -4).moveTo(1.2, 0).lineTo(1.2 - step, -4).stroke({ width: 1.3, color: f.legs });
  g.rect(-2.4, top, 4.8, 7).fill(body);
  if (defender) g.rect(-2.4, top + 2.5, 4.8, 1).fill({ color: f.tabardStripe, alpha: 0.75 });
  g.circle(0, top - 2, 1.9).fill(f.skin);
  // Helmet for the garrison, a hood for raiders.
  if (defender) g.rect(-2.1, top - 4.3, 4.2, 2).fill(f.helm);
  else g.poly([-2.4, top - 1.5, 0, top - 5, 2.4, top - 1.5]).fill(f.hood);

  if (archer) {
    // The bow: drawn when shooting, held otherwise.
    const draw = act === 'shoot' ? (Math.sin(t * 3) + 1) * 1.2 : 0;
    const bx = 3.5;
    const by = top + 2;
    if (f.outline !== null) g.moveTo(bx, by - 5).quadraticCurveTo(bx + 3, by, bx, by + 5).stroke({ width: 2.2, color: f.outline });
    g.moveTo(bx, by - 5).quadraticCurveTo(bx + 3, by, bx, by + 5).stroke({ width: 1, color: f.wood });
    g.moveTo(bx, by - 5).lineTo(bx - draw, by).lineTo(bx, by + 5).stroke({ width: 0.5, color: 0xe8e2d0, alpha: 0.8 });
  } else {
    // Sword (or axe for raiders) swung when fighting or battering; a small shield for the garrison.
    const busy = act === 'fight' || act === 'batter' || act === 'loot' || act === 'sap' || act === 'raise';
    const swing = busy ? Math.sin(t * (act === 'batter' ? 6 : 8)) : -0.3;
    const hx = 2.4;
    const hy = top + 2;
    const ang = -1.1 + swing * 0.9;
    const ex = hx + Math.cos(ang) * 6;
    const ey = hy + Math.sin(ang) * 6;
    if (f.outline !== null) g.moveTo(hx, hy).lineTo(ex, ey).stroke({ width: 2.4, color: f.outline });
    g.moveTo(hx, hy).lineTo(ex, ey).stroke({ width: 1.2, color: defender ? f.steel : 0x8c8c8c });
    if (!defender) g.rect(ex - 1.5, ey - 1.5, 3, 2.5).fill(0x6f6f6f);
    if (defender) g.ellipse(-2.8, top + 3.5, 1.8, 2.6).fill(f.wood).stroke({ width: f.outline !== null ? 1 : 0.6, color: f.outline ?? f.steel });
  }
  if (health < 0.999) {
    g.rect(-4, top - 8, 8, 1.6).fill({ color: 0x000000, alpha: 0.6 });
    g.rect(-4, top - 8, 8 * Math.max(0, health), 1.6).fill(health > 0.5 ? 0x9fd98b : health > 0.25 ? 0xf0c56a : 0xf08a72);
  }
  g.setTransform(1, 0, 0, 1, 0, 0);
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
    const s = isoToScreen(cx, cy, p.ground + drawnLevels(p.levels, p.kind) + 0.8);
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
      level = Math.max(...footprint(piece).map(([px, py]) => heightAt(sim.map, px, py))) + drawnLevels(levels, piece.kind);
    }
    const p = isoToScreen(x, y, level);
    drawSoldier(g, p.sx, p.sy, post.type, 'stand', t + n, 1, !!(piece && built), n % 2 === 1);
  }
}
