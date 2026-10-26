import type { Graphics } from 'pixi.js';
import { WALL_THICKNESS } from '../data/castle';
import {
  footprint,
  isCurtain,
  linked,
  pieceLevels,
  type Piece,
  type PieceSpec,
  type PlanView,
} from '../sim/castle';
import { heightAt, inBounds, NEIGHBOURS, stepBetween } from '../sim/terrain';
import { isoToScreen, TILE_H, TILE_W } from './iso';
import { shade } from './terrainStyle';
import type { RowExtras } from './terrainView';
import { tileCorners, type TileShape } from './tileGeometry';

/** Colours for one piece. Plain stone, or tinted for previews and problems. */
export interface Palette {
  top: number;
  face: number;
  dark: number;
}

export const STONE: Palette = { top: 0xcfc6b0, face: 0xb0a690, dark: 0x2b241c };
const BAD_TINT = 0xd8452f;
const GOOD_TINT = 0x8fe08a;
const BANNER = 0xb3342a;
const RAISE_COLOUR = 0xf2c14e;
const LOWER_COLOUR = 0x5fb4ea;

export function tinted(p: Palette, colour: number, amount: number): Palette {
  return { top: mix(p.top, colour, amount), face: mix(p.face, colour, amount), dark: p.dark };
}

export const PROBLEM = tinted(STONE, BAD_TINT, 0.45);
export const GHOST_OK = tinted(STONE, GOOD_TINT, 0.35);
export const GHOST_BAD = tinted(STONE, BAD_TINT, 0.55);

/** How far a piece sinks below its tile's lowest corner, so slopes never show a gap under it. */
const SINK = 0.2;
const MERLON = 0.09;
const MERLON_H = 0.35;

/** A world-space box: tile coordinates for x and y, height levels for the base and top. */
interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  base: number;
  top: number;
}

/**
 * Draws castle pieces in code. Pieces are drawn with the diagonal row of their front-most tile,
 * so land and pieces in front overlap them correctly. Reads plan state; never changes it.
 */
export class CastleArt implements RowExtras {
  private problems: ReadonlySet<number> = new Set();

  constructor(private view: PlanView) {}

  /** Use a new plan snapshot; pieces with ids in `problems` are drawn tinted red. */
  setView(view: PlanView, problems: ReadonlySet<number>): void {
    this.view = view;
    this.problems = problems;
  }

  /** Built tiles hide the trees and stones that were there. */
  hidesDecor(x: number, y: number): boolean {
    return this.view.occupant[y * this.view.map.width + x] !== 0;
  }

  /** Draw every piece whose front-most tile is on this diagonal row. */
  drawRow(diagonal: number, g: Graphics): void {
    for (const p of this.view.plan.pieces) {
      if (frontDiagonal(p) !== diagonal) continue;
      this.drawPiece(g, p, this.problems.has(p.id) ? PROBLEM : STONE);
    }
  }

  drawPiece(g: Graphics, p: PieceSpec | Piece, pal: Palette): void {
    const base = this.baseLevel(p) - SINK;
    const top = Math.max(...footprint(p).map(([x, y]) => heightAt(this.view.map, x, y))) + pieceLevels(p);
    switch (p.kind) {
      case 'wall':
        this.drawWall(g, p, base, top, pal);
        break;
      case 'tower':
        if (p.shape === 'round') drawRoundTower(g, p.x, p.y, 0.42, base, top, pal);
        else drawSquareTower(g, p.x, p.y, 0.42, base, top, pal);
        break;
      case 'gatehouse':
        drawGatehouse(g, p.x, p.y, p.axis, base, top, pal);
        break;
      case 'keep':
        drawKeep(g, p.x, p.y, base, top, pal);
        break;
    }
  }

  /** Previews float over everything else, so they are never hidden behind a hill. */
  drawGhosts(g: Graphics, specs: readonly PieceSpec[], problems: readonly (string | null)[]): void {
    const order = specs.map((s, i) => ({ s, bad: problems[i] !== null })).sort((a, b) => frontDiagonal(a.s) - frontDiagonal(b.s));
    for (const { s, bad } of order) this.drawPiece(g, s, bad ? GHOST_BAD : GHOST_OK);
  }

  /** Tiles marked for earthworks: amber to raise, blue to lower, one chevron per level. */
  drawEarthworks(g: Graphics, shapeAt: (x: number, y: number) => TileShape | undefined): void {
    const { map, plan } = this.view;
    for (let y = 0; y < map.height; y++)
      for (let x = 0; x < map.width; x++) {
        const d = plan.earthworks[y * map.width + x] ?? 0;
        const s = shapeAt(x, y);
        if (d === 0 || !s) continue;
        const colour = d > 0 ? RAISE_COLOUR : LOWER_COLOUR;
        g.poly(s.top.flatMap((p) => [p.x, p.y])).fill({ color: colour, alpha: 0.28 }).stroke({ width: 1.5, color: colour, alpha: 0.9 });
        const c = isoToScreen(x, y, (s.corners.n + s.corners.e + s.corners.s + s.corners.w) / 4);
        const n = Math.min(3, Math.abs(d));
        for (let i = 0; i < n; i++) {
          const cy = c.sy + (i - (n - 1) / 2) * 5;
          const tip = d > 0 ? -3 : 3;
          g.moveTo(c.sx - 6, cy - tip / 2)
            .lineTo(c.sx, cy + tip / 2)
            .lineTo(c.sx + 6, cy - tip / 2)
            .stroke({ width: 2, color: 0x1b1f24, alpha: 0.85, cap: 'round', join: 'round' });
        }
      }
  }

  private baseLevel(p: PieceSpec): number {
    const { map } = this.view;
    let low = Infinity;
    for (const [x, y] of footprint(p)) {
      if (!inBounds(map, x, y)) continue;
      const c = tileCorners(map, x, y);
      low = Math.min(low, c.n, c.e, c.s, c.w);
    }
    return Number.isFinite(low) ? low : 0;
  }

  /** A wall is an arm from the tile centre towards each linked neighbour (or a stub if alone). */
  private drawWall(g: Graphics, p: Extract<PieceSpec, { kind: 'wall' }>, base: number, top: number, pal: Palette): void {
    const hw = WALL_THICKNESS[p.thickness].width / 2;
    const { x, y } = p;
    const links = NEIGHBOURS.filter(([dx, dy]) => this.linksTo(p, x + dx, y + dy));
    // Back arms first, then front arms, so the nearer faces end up on top.
    const arms = [...links].sort((a, b) => a[0] + a[1] - (b[0] + b[1]));
    const boxes: Box[] =
      arms.length === 0
        ? [{ x0: x - hw, y0: y - hw, x1: x + hw, y1: y + hw, base, top }]
        : arms.map(([dx, dy]) => ({
            x0: dx < 0 ? x - 0.5 : x - hw,
            x1: dx > 0 ? x + 0.5 : x + hw,
            y0: dy < 0 ? y - 0.5 : y - hw,
            y1: dy > 0 ? y + 0.5 : y + hw,
            base,
            top,
          }));
    for (const b of boxes) drawBox(g, b, pal, true);
    const merlons: Box[] = [];
    arms.forEach(([dx], i) => {
      const b = boxes[i] as Box;
      merlons.push(...edgeMerlons(b, dx !== 0 ? 'x' : 'y'));
    });
    if (arms.length === 0) merlons.push(...ringMerlons(boxes[0] as Box));
    drawMerlons(g, merlons, pal);
  }

  /** Pieces in a preview link to the plan's curtain, and to each other, as if already placed. */
  private linksTo(p: PieceSpec, nx: number, ny: number): boolean {
    const { map, plan, occupant } = this.view;
    if (plan.pieces.includes(p as Piece)) return linked(this.view, p.x, p.y, nx, ny);
    if (!inBounds(map, nx, ny) || stepBetween(heightAt(map, p.x, p.y), heightAt(map, nx, ny)) === 'cliff') return false;
    const other = plan.pieces[(occupant[ny * map.width + nx] ?? 0) - 1];
    return (!!other && isCurtain(other.kind)) || this.previewTiles.has(`${nx},${ny}`);
  }

  /** Tiles of the preview being drawn, so a dragged line of wall joins up with itself. */
  previewTiles = new Set<string>();
}

/** The diagonal row (x + y) of a piece's front-most tile. */
export function frontDiagonal(p: PieceSpec): number {
  return Math.max(...footprint(p).map(([x, y]) => x + y));
}

function pt(x: number, y: number, level: number): number[] {
  const p = isoToScreen(x, y, level);
  return [p.sx, p.sy];
}

/** The three visible faces of a box: the top, the +y face (lit) and the +x face (shaded). */
function drawBox(g: Graphics, b: Box, pal: Palette, courses = false): void {
  const { x0, y0, x1, y1, base, top } = b;
  g.poly([...pt(x1, y1, top), ...pt(x0, y1, top), ...pt(x0, y1, base), ...pt(x1, y1, base)]).fill(shade(pal.face, 1));
  g.poly([...pt(x1, y0, top), ...pt(x1, y1, top), ...pt(x1, y1, base), ...pt(x1, y0, base)]).fill(shade(pal.face, 0.78));
  if (courses) {
    // Faint courses of stone, one per half level.
    for (let lv = Math.ceil((base + 0.01) * 2) / 2; lv < top - 0.1; lv += 0.5) {
      g.moveTo(...(pt(x0, y1, lv) as [number, number]))
        .lineTo(...(pt(x1, y1, lv) as [number, number]))
        .lineTo(...(pt(x1, y0, lv) as [number, number]))
        .stroke({ width: 0.7, color: pal.dark, alpha: 0.18 });
    }
  }
  g.poly([...pt(x0, y0, top), ...pt(x1, y0, top), ...pt(x1, y1, top), ...pt(x0, y1, top)])
    .fill(pal.top)
    .stroke({ width: 0.8, color: pal.dark, alpha: 0.35 });
}

/** Merlons along both long edges of a box running along the given axis. */
function edgeMerlons(b: Box, along: 'x' | 'y'): Box[] {
  const out: Box[] = [];
  const m = MERLON / 2;
  const [s0, s1] = along === 'x' ? [b.x0, b.x1] : [b.y0, b.y1];
  const sideA = along === 'x' ? b.y0 + m : b.x0 + m;
  const sideB = along === 'x' ? b.y1 - m : b.x1 - m;
  const n = Math.max(1, Math.round((s1 - s0) / 0.22));
  for (let i = 0; i < n; i++) {
    const c = s0 + ((i + 0.5) * (s1 - s0)) / n;
    for (const side of [sideA, sideB]) {
      out.push(
        along === 'x'
          ? { x0: c - m, x1: c + m, y0: side - m, y1: side + m, base: b.top, top: b.top + MERLON_H }
          : { x0: side - m, x1: side + m, y0: c - m, y1: c + m, base: b.top, top: b.top + MERLON_H },
      );
    }
  }
  return out;
}

/** Merlons all round the top of a box. */
function ringMerlons(b: Box, spacing = 0.22): Box[] {
  const m = MERLON / 2;
  const out: Box[] = [];
  const nx = Math.max(1, Math.round((b.x1 - b.x0) / spacing));
  const ny = Math.max(1, Math.round((b.y1 - b.y0) / spacing));
  const at = (cx: number, cy: number) => out.push({ x0: cx - m, x1: cx + m, y0: cy - m, y1: cy + m, base: b.top, top: b.top + MERLON_H });
  for (let i = 0; i <= nx; i += 2) {
    const cx = b.x0 + m + ((b.x1 - b.x0 - 2 * m) * i) / nx;
    at(cx, b.y0 + m);
    at(cx, b.y1 - m);
  }
  for (let j = 2; j < ny; j += 2) {
    const cy = b.y0 + m + ((b.y1 - b.y0 - 2 * m) * j) / ny;
    at(b.x0 + m, cy);
    at(b.x1 - m, cy);
  }
  return out;
}

function drawMerlons(g: Graphics, merlons: Box[], pal: Palette): void {
  merlons.sort((a, b) => a.x0 + a.y0 - (b.x0 + b.y0));
  for (const m of merlons) drawBox(g, m, pal);
}

/** A dark opening on the +y face (side 'left') or +x face (side 'right') of a box. */
function slit(g: Graphics, b: Box, side: 'left' | 'right', at: number, level: number, w = 0.05, h = 0.6, colour = 0x2b241c): void {
  const pts =
    side === 'left'
      ? [...pt(at - w, b.y1, level + h), ...pt(at + w, b.y1, level + h), ...pt(at + w, b.y1, level), ...pt(at - w, b.y1, level)]
      : [...pt(b.x1, at - w, level + h), ...pt(b.x1, at + w, level + h), ...pt(b.x1, at + w, level), ...pt(b.x1, at - w, level)];
  g.poly(pts).fill(colour);
}

function drawSquareTower(g: Graphics, x: number, y: number, r: number, base: number, top: number, pal: Palette): void {
  const b: Box = { x0: x - r, y0: y - r, x1: x + r, y1: y + r, base, top };
  drawBox(g, b, pal, true);
  for (let lv = top - 1; lv > base + 0.6; lv -= 1.4) {
    slit(g, b, 'left', x, lv - 0.3, 0.04, 0.55, pal.dark);
    slit(g, b, 'right', y, lv - 0.3, 0.04, 0.55, pal.dark);
  }
  drawMerlons(g, ringMerlons(b), pal);
}

function drawRoundTower(g: Graphics, x: number, y: number, r: number, base: number, top: number, pal: Palette): void {
  const rx = (r * TILE_W) / Math.SQRT2;
  const ry = (r * TILE_H) / Math.SQRT2;
  const c0 = isoToScreen(x, y, base);
  const c1 = isoToScreen(x, y, top);
  const arc = (cy: number, from: number, to: number) => {
    const out: number[] = [];
    for (let i = 0; i <= 12; i++) {
      const a = from + ((to - from) * i) / 12;
      out.push(c0.sx + rx * Math.cos(a), cy + ry * Math.sin(a));
    }
    return out;
  };
  const half = (from: number, to: number) => {
    const lower = arc(c0.sy, from, to);
    const upper = arc(c1.sy, to, from);
    return [...lower, ...upper];
  };
  g.poly(half(Math.PI, Math.PI / 2)).fill(shade(pal.face, 1));
  g.poly(half(Math.PI / 2, 0)).fill(shade(pal.face, 0.78));
  for (let lv = top - 1; lv > base + 0.6; lv -= 1.4) {
    const s = isoToScreen(x, y, lv - 0.3);
    g.rect(s.sx - rx * 0.45 - 1.5, s.sy + ry * 0.85 - 9, 3, 9).fill(pal.dark);
    g.rect(s.sx + rx * 0.45 - 1.5, s.sy + ry * 0.85 - 9, 3, 9).fill(pal.dark);
  }
  g.ellipse(c1.sx, c1.sy, rx, ry).fill(pal.top).stroke({ width: 0.8, color: pal.dark, alpha: 0.35 });
  const m = MERLON / 2;
  const merlons: Box[] = [];
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    const cx = x + (r - m) * Math.cos(a);
    const cy = y + (r - m) * Math.sin(a);
    merlons.push({ x0: cx - m, x1: cx + m, y0: cy - m, y1: cy + m, base: top, top: top + MERLON_H });
  }
  drawMerlons(g, merlons, pal);
}

function drawGatehouse(g: Graphics, x: number, y: number, axis: 'x' | 'y', base: number, top: number, pal: Palette): void {
  const r = 0.47;
  const b: Box = { x0: x - r, y0: y - r, x1: x + r, y1: y + r, base, top };
  drawBox(g, b, pal, true);
  // The arch on the visible end of the passage, with a portcullis.
  const ground = base + 0.2;
  const w = 0.2;
  const spring = ground + 1;
  const archPts: number[] = [];
  const along = (u: number, lv: number) => (axis === 'x' ? pt(b.x1, y + u, lv) : pt(x + u, b.y1, lv));
  archPts.push(...along(-w, ground), ...along(-w, spring));
  for (let i = 1; i < 8; i++) {
    const a = Math.PI - (i / 8) * Math.PI;
    archPts.push(...along(w * Math.cos(a), spring + 0.45 * Math.sin(a)));
  }
  archPts.push(...along(w, spring), ...along(w, ground));
  g.poly(archPts).fill(pal.dark);
  for (let i = -2; i <= 2; i++) {
    const [ax, ay] = along((i * w) / 2.5, ground) as [number, number];
    const [bx, by] = along((i * w) / 2.5, spring + 0.3) as [number, number];
    g.moveTo(ax, ay).lineTo(bx, by).stroke({ width: 1, color: 0x6b5a40, alpha: 0.9 });
  }
  const parts: Box[] = ringMerlons(b);
  // Corner turrets stand a little taller.
  const t = 0.15;
  for (const [cx, cy] of [
    [b.x0 + t, b.y0 + t],
    [b.x1 - t, b.y0 + t],
    [b.x0 + t, b.y1 - t],
    [b.x1 - t, b.y1 - t],
  ] as const)
    parts.push({ x0: cx - t, x1: cx + t, y0: cy - t, y1: cy + t, base: top, top: top + 0.8 });
  drawMerlons(g, parts, pal);
}

function drawKeep(g: Graphics, x: number, y: number, base: number, top: number, pal: Palette): void {
  const inset = 0.08;
  const b: Box = { x0: x - 0.5 + inset, y0: y - 0.5 + inset, x1: x + 1.5 - inset, y1: y + 1.5 - inset, base, top };
  drawBox(g, b, pal, true);
  for (let lv = top - 1.2; lv > base + 1; lv -= 1.6)
    for (const at of [0.15, 0.85]) {
      slit(g, b, 'left', x - 0.5 + at * 2, lv - 0.4, 0.06, 0.7, pal.dark);
      slit(g, b, 'right', y - 0.5 + at * 2, lv - 0.4, 0.06, 0.7, pal.dark);
    }
  const t = 0.2;
  const parts: Box[] = ringMerlons(b);
  for (const [cx, cy] of [
    [b.x0 + t, b.y0 + t],
    [b.x1 - t, b.y0 + t],
    [b.x0 + t, b.y1 - t],
    [b.x1 - t, b.y1 - t],
  ] as const)
    parts.push({ x0: cx - t, x1: cx + t, y0: cy - t, y1: cy + t, base: top, top: top + 1 });
  drawMerlons(g, parts, pal);
  // A flagpole with a plain pennant (heraldry comes in M8).
  const [px, py] = pt(x + 0.5, y + 0.5, top) as [number, number];
  const poleTop = py - 46;
  g.moveTo(px, py).lineTo(px, poleTop).stroke({ width: 1.5, color: 0x3a2e22 });
  g.poly([px, poleTop, px + 20, poleTop + 5, px, poleTop + 10]).fill(BANNER);
}

function mix(a: number, b: number, t: number): number {
  const ch = (c: number, s: number) => (c >> s) & 0xff;
  const m = (s: number) => Math.round(ch(a, s) + (ch(b, s) - ch(a, s)) * t) << s;
  return m(16) | m(8) | m(0);
}

/**
 * The piece drawn at a world-space point, if it stands in front of the given ground tile's row.
 * Uses each piece's outline (its footprint from base to top), checked front to back.
 */
export function pickPiece(view: PlanView, px: number, py: number, groundDiagonal: number): Piece | null {
  let best: Piece | null = null;
  let bestDiagonal = groundDiagonal - 1;
  for (const p of view.plan.pieces) {
    const d = frontDiagonal(p);
    if (d <= bestDiagonal) continue;
    const tiles = footprint(p);
    const base = Math.min(...tiles.map(([x, y]) => heightAt(view.map, x, y)));
    const top = Math.max(...tiles.map(([x, y]) => heightAt(view.map, x, y))) + pieceLevels(p);
    const x0 = Math.min(...tiles.map(([x]) => x)) - 0.5;
    const y0 = Math.min(...tiles.map(([, y]) => y)) - 0.5;
    const x1 = Math.max(...tiles.map(([x]) => x)) + 0.5;
    const y1 = Math.max(...tiles.map(([, y]) => y)) + 0.5;
    // On screen the box's outline is a hexagon: top-back corner, the sides, and bottom-front corner.
    const hull = [pt(x0, y0, top), pt(x1, y0, top), pt(x1, y0, base), pt(x1, y1, base), pt(x0, y1, base), pt(x0, y1, top)];
    if (insideConvex(px, py, hull)) {
      best = p;
      bestDiagonal = d;
    }
  }
  return best;
}

function insideConvex(px: number, py: number, pts: number[][]): boolean {
  let sign = 0;
  for (let i = 0; i < pts.length; i++) {
    const [ax = 0, ay = 0] = pts[i] as number[];
    const [bx = 0, by = 0] = pts[(i + 1) % pts.length] as number[];
    const cross = (bx - ax) * (py - ay) - (by - ay) * (px - ax);
    if (cross === 0) continue;
    if (sign === 0) sign = Math.sign(cross);
    else if (Math.sign(cross) !== sign) return false;
  }
  return true;
}
