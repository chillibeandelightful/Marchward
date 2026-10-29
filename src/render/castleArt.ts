import { Matrix, type Graphics, type Texture } from 'pixi.js';
import { WALL_THICKNESS } from '../data/castle';
import {
  footprint,
  hasSlits,
  isCurtain,
  linked,
  pieceAt,
  pieceLevels,
  type Piece,
  type PieceSpec,
  type PlanView,
} from '../sim/castle';
import { heightAt, inBounds, NEIGHBOURS, stepBetween } from '../sim/terrain';
import { hash2 } from '../sim/noise';
import { drawnLevels, isoToScreen, levelPx, viewAngle } from './iso';
import { paintedTexture, type TextureName } from './paintedArt';
import { style, type Palette } from './styles';
import { mix, shade } from './terrainStyle';
import type { RowExtras } from './terrainView';
import { foundationOutline, type Joined } from './foundation';
import { surfaceLevel, tileCorners, type TileShape } from './tileGeometry';

const BAD_TINT = 0xd8452f;
const GOOD_TINT = 0x8fe08a;
const RAISE_COLOUR = 0xf2c14e;
const LOWER_COLOUR = 0x5fb4ea;

export function tinted(p: Palette, colour: number, amount: number): Palette {
  return { top: mix(p.top, colour, amount), face: mix(p.face, colour, amount), dark: p.dark };
}

/** Palettes for the active style: built stone, a problem, the placement previews and the planned model. */
const stone = () => style().castle.stone;
const problem = () => tinted(stone(), BAD_TINT, 0.45);
const ghostOk = () => tinted(stone(), GOOD_TINT, 0.35);
const ghostBad = () => tinted(stone(), BAD_TINT, 0.55);
const planned = () => style().castle.planned;

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
  /** How far each piece is built, 0 to 1. Everything counts as built until told otherwise. */
  private progress: (p: Piece) => number = () => 1;

  constructor(private view: PlanView) {}

  /** Use a new plan snapshot; pieces with ids in `problems` are drawn tinted red. */
  setView(view: PlanView, problems: ReadonlySet<number>): void {
    this.view = view;
    this.problems = problems;
  }

  /** Tell the art how far each piece is built. */
  setProgress(progress: (p: Piece) => number): void {
    this.progress = progress;
  }

  /** In battle: which pieces have been breached and lie in rubble. */
  setRubble(rubble: (p: Piece) => boolean): void {
    this.rubble = rubble;
  }

  private rubble: (p: Piece) => boolean = () => false;

  /** Built tiles hide the trees and stones that were there. */
  hidesDecor(x: number, y: number): boolean {
    return this.view.occupant[y * this.view.map.width + x] !== 0;
  }

  /** Draw this row's earthwork marks, then every piece whose front-most tile is on this row. */
  drawRow(diagonal: number, g: Graphics): void {
    this.drawEarthworks(g, diagonal);
    for (const p of this.view.plan.pieces) {
      if (frontDiagonal(p) !== diagonal) continue;
      const done = this.progress(p);
      if (this.rubble(p)) this.drawRubble(g, p);
      else if (done >= 1) this.drawPiece(g, p, this.problems.has(p.id) ? problem() : stone());
      else {
        // Only the footings are marked out on the ground until it's finished, like a builder's
        // lines: where it goes, not what it will look like. The built part rises in stone inside.
        this.drawFoundation(g, p, this.problems.has(p.id) ? BAD_TINT : planned().top);
        if (done > 0) {
          this.drawPiece(g, p, stone(), done);
          this.drawScaffold(g, p, done);
        }
      }
    }
  }

  /** Draw a piece; with `built` under 1 it stands that share of its height, without battlements. */
  drawPiece(g: Graphics, p: PieceSpec | Piece, pal: Palette, built = 1): void {
    const base = this.baseLevel(p) - SINK;
    const full = Math.max(...footprint(p).map(([x, y]) => heightAt(this.view.map, x, y))) + drawnLevels(pieceLevels(p), p.kind);
    const finished = built >= 1;
    const top = finished ? full : base + (full - base) * Math.max(0.12, built);
    switch (p.kind) {
      case 'wall':
        this.drawWall(g, p, base, top, pal, finished);
        break;
      case 'tower':
        if (p.shape === 'round') drawRoundTower(g, p.x, p.y, 0.42, base, top, pal, finished, hasSlits(p));
        else drawSquareTower(g, p.x, p.y, 0.42, base, top, pal, finished, hasSlits(p));
        break;
      case 'gatehouse':
        drawGatehouse(g, p.x, p.y, p.axis, base, top, pal, finished);
        if (finished && p.slits) {
          const b: Box = { x0: p.x - 0.47, y0: p.y - 0.47, x1: p.x + 0.47, y1: p.y + 0.47, base, top };
          slit(g, b, p.axis === 'x' ? 'left' : 'right', p.axis === 'x' ? p.x : p.y, top - 1.1, 0.04, 0.55, pal.dark);
        }
        break;
      case 'keep':
        drawKeep(g, p.x, p.y, base, top, pal, finished);
        break;
    }
    if (finished && p.cauldron) drawCauldron(g, p.x, p.y, top, pal);
  }

  /** A breached piece: a low heap of fallen stone on its footings. */
  private drawRubble(g: Graphics, p: PieceSpec): void {
    const base = this.baseLevel(p) - SINK;
    for (const [x, y] of footprint(p)) {
      const blocks: Box[] = [];
      for (let i = 0; i < 9; i++) {
        const u = ((i * 37) % 9) / 9 - 0.45;
        const v = ((i * 53) % 9) / 9 - 0.45;
        const h = 0.25 + ((i * 29) % 5) * 0.08;
        blocks.push({ x0: x + u * 0.8 - 0.1, y0: y + v * 0.8 - 0.1, x1: x + u * 0.8 + 0.1, y1: y + v * 0.8 + 0.1, base, top: base + SINK + h });
      }
      blocks.sort((a, b) => a.x0 + a.y0 - (b.x0 + b.y0));
      for (const b of blocks) drawBox(g, b, tinted(stone(), 0x5a5040, 0.35));
    }
  }

  /** Previews float over everything else, so they are never hidden behind a hill. */
  drawGhosts(g: Graphics, specs: readonly PieceSpec[], problems: readonly (string | null)[]): void {
    const order = specs.map((s, i) => ({ s, bad: problems[i] !== null })).sort((a, b) => frontDiagonal(a.s) - frontDiagonal(b.s));
    for (const { s, bad } of order) this.drawPiece(g, s, bad ? ghostBad() : ghostOk());
  }

  /** Ground shapes, for drawing earthwork marks on the land as it will be. */
  setShapes(shapeAt: (x: number, y: number) => TileShape | undefined): void {
    this.shapeAt = shapeAt;
  }

  private shapeAt: (x: number, y: number) => TileShape | undefined = () => undefined;

  /**
   * Tiles on this row marked for earthworks: amber to raise, blue to lower, one chevron per
   * level. Drawn with the row, so land and pieces in front cover them; none under a piece.
   */
  private drawEarthworks(g: Graphics, diagonal: number): void {
    const { map, plan, occupant } = this.view;
    for (let x = Math.max(0, diagonal - map.height + 1); x <= Math.min(diagonal, map.width - 1); x++) {
      const y = diagonal - x;
      const d = plan.earthworks[y * map.width + x] ?? 0;
      const s = this.shapeAt(x, y);
      if (d === 0 || !s || occupant[y * map.width + x]) continue;
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

  /** Poles and ledgers along the front faces of a piece being built. */
  private drawScaffold(g: Graphics, p: PieceSpec, built: number): void {
    const tiles = footprint(p);
    const x0 = Math.min(...tiles.map(([x]) => x)) - 0.5;
    const y0 = Math.min(...tiles.map(([, y]) => y)) - 0.5;
    const x1 = Math.max(...tiles.map(([x]) => x)) + 0.5;
    const y1 = Math.max(...tiles.map(([, y]) => y)) + 0.5;
    const base = this.baseLevel(p) - SINK;
    const full = Math.max(...tiles.map(([x, y]) => heightAt(this.view.map, x, y))) + drawnLevels(pieceLevels(p), p.kind);
    const top = base + (full - base) * Math.max(0.12, built) + 0.5;
    const line = (ax: number, ay: number, al: number, bx: number, by: number, bl: number, width: number) =>
      g
        .moveTo(...(pt(ax, ay, al) as [number, number]))
        .lineTo(...(pt(bx, by, bl) as [number, number]))
        .stroke({ width, color: style().castle.scaffold, alpha: 0.95 });
    const poles: [number, number][] = [
      [x0 + 0.08, y1],
      [(x0 + x1) / 2, y1],
      [x1, y1],
      [x1, (y0 + y1) / 2],
      [x1, y0 + 0.08],
    ];
    for (const [px, py] of poles) line(px, py, base + SINK, px, py, top, 1.4);
    for (let lv = base + 1; lv < top; lv += 1) {
      line(x0 + 0.08, y1, lv, x1, y1, lv, 1);
      line(x1, y1, lv, x1, y0 + 0.08, lv, 1);
    }
  }

  private baseLevel(p: PieceSpec): number {
    const { map } = this.view;
    let low = Infinity;
    for (const [x, y] of footprint(p)) {
      if (!inBounds(map, x, y)) continue;
      const c = tileCorners(map, x, y, this.view.occupant);
      low = Math.min(low, c.n, c.e, c.s, c.w);
    }
    return Number.isFinite(low) ? low : 0;
  }

  /** A wall is an arm from the tile centre towards each linked neighbour (or a stub if alone). */
  private drawWall(g: Graphics, p: Extract<PieceSpec, { kind: 'wall' }>, base: number, top: number, pal: Palette, finished = true): void {
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
    if (!finished) return;
    if (p.slits)
      for (const [i, [dx, dy]] of arms.entries()) {
        const b = boxes[i] as Box;
        // Slits on the visible face of each arm, a little below the walk.
        if (dx !== 0) slit(g, b, 'left', (b.x0 + b.x1) / 2, top - 0.95, 0.035, 0.5, pal.dark);
        if (dy !== 0) slit(g, b, 'right', (b.y0 + b.y1) / 2, top - 0.95, 0.035, 0.5, pal.dark);
      }
    if (p.slits && arms.length === 0) {
      const b = boxes[0] as Box;
      slit(g, b, 'left', x, top - 0.95, 0.035, 0.5, pal.dark);
      slit(g, b, 'right', y, top - 0.95, 0.035, 0.5, pal.dark);
    }
    const merlons: Box[] = [];
    arms.forEach(([dx], i) => {
      const b = boxes[i] as Box;
      merlons.push(...edgeMerlons(b, dx !== 0 ? 'x' : 'y'));
    });
    if (arms.length === 0) merlons.push(...ringMerlons(boxes[0] as Box));
    drawMerlons(g, merlons, pal);
  }

  /** The outline of a planned piece's footings, drawn on the ground in `colour` over a faint shadow. */
  private drawFoundation(g: Graphics, p: Piece, colour: number): void {
    const joined = (nx: number, ny: number): Joined => {
      if (!this.linksTo(p, nx, ny)) return null;
      const o = pieceAt(this.view, nx, ny);
      if (!o || o.kind === 'keep') return null;
      return o.kind === 'tower' && o.shape === 'round' ? 'round-tower' : o.kind;
    };
    const { segments, circles } = foundationOutline(p, joined);
    const lines: number[][] = segments.map(([x0, y0, x1, y1]) => {
      // Split each edge so the line follows slopes rather than cutting through them.
      const out: number[] = [];
      for (let i = 0; i <= 4; i++) out.push(...this.onGround(x0 + ((x1 - x0) * i) / 4, y0 + ((y1 - y0) * i) / 4));
      return out;
    });
    for (const c of circles) {
      const out: number[] = [];
      for (let i = 0; i <= 24; i++) {
        const a = (i / 24) * Math.PI * 2;
        out.push(...this.onGround(c.x + Math.cos(a) * c.r, c.y + Math.sin(a) * c.r));
      }
      lines.push(out);
    }
    for (const l of lines) g.poly(l, false);
    g.stroke({ width: 3.5, color: planned().dark, alpha: 0.35, cap: 'round', join: 'round' });
    for (const l of lines) g.poly(l, false);
    g.stroke({ width: 1.6, color: colour, alpha: 0.95, cap: 'round', join: 'round' });
  }

  /** Screen point on the drawn ground at fractional tile coordinates, a hair above it. */
  private onGround(fx: number, fy: number): number[] {
    const tx = Math.round(fx);
    const ty = Math.round(fy);
    const s = this.shapeAt(tx, ty);
    const level = s ? surfaceLevel(s.corners, fx - tx, fy - ty) : heightAt(this.view.map, tx, ty);
    return pt(fx, fy, level + 0.02);
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

/** Pixels of the painted stone texture per tile along a face or across a top. Up a face, one pixel is one screen pixel. */
export const STONE_TEXELS = 32;
/** The shaded (+x) faces are drawn this much darker than the lit ones. */
const SHADED = 0.78;

/**
 * The matrix taking painted stone texture pixels to the screen, for a face running along x (at
 * y = `at`) or along y (at x = `at`), or for a flat top at level `at`. The texture is pinned to the
 * world, so neighbouring pieces' courses and joints line up. As [a, b, c, d, tx, ty].
 */
export function stoneMatrix(kind: 'x' | 'y' | 'top', at: number): [number, number, number, number, number, number] {
  const { tileW: w, tileH: h } = viewAngle();
  const s = STONE_TEXELS;
  if (kind === 'x') return [w / (2 * s), h / (2 * s), 0, 1, (-at * w) / 2, (at * h) / 2];
  if (kind === 'y') return [-w / (2 * s), h / (2 * s), 0, 1, (at * w) / 2, (at * h) / 2];
  return [w / (2 * s), h / (2 * s), -w / (2 * s), h / (2 * s), 0, -at * levelPx()];
}

/** The hand-made texture for built stone, when the style paints it and the art is loaded. */
function stoneArt(pal: Palette, name: TextureName): Texture | undefined {
  return pal === stone() && style().castle.masonry === 'painted' ? paintedTexture(name) : undefined;
}

function paint(texture: Texture, m: [number, number, number, number, number, number], light = 1) {
  return { texture, matrix: new Matrix(...m), color: shade(0xffffff, Math.min(1, light)), textureSpace: 'global' as const };
}

/** The three visible faces of a box: the top, the +y face (lit) and the +x face (shaded). */
function drawBox(g: Graphics, b: Box, pal: Palette, courses = false): void {
  const { x0, y0, x1, y1, base, top } = b;
  const { masonry, outline } = style().castle;
  const left = [...pt(x1, y1, top), ...pt(x0, y1, top), ...pt(x0, y1, base), ...pt(x1, y1, base)];
  const right = [...pt(x1, y0, top), ...pt(x1, y1, top), ...pt(x1, y1, base), ...pt(x1, y0, base)];
  const face = stoneArt(pal, 'stoneFace');
  if (face) {
    g.poly(left).fill(paint(face, stoneMatrix('x', y1)));
    g.poly(right).fill(paint(face, stoneMatrix('y', x1), SHADED));
  } else {
    g.poly(left).fill(shade(pal.face, 1));
    g.poly(right).fill(shade(pal.face, SHADED));
  }
  if (courses && !face && masonry !== 'courses') drawBlocks(g, b, pal);
  else if (courses) {
    // Faint courses of stone, one per half level.
    for (let lv = Math.ceil((base + 0.01) * 2) / 2; lv < top - 0.1; lv += 0.5) {
      g.moveTo(...(pt(x0, y1, lv) as [number, number]))
        .lineTo(...(pt(x1, y1, lv) as [number, number]))
        .lineTo(...(pt(x1, y0, lv) as [number, number]))
        .stroke({ width: 0.7, color: pal.dark, alpha: 0.18 });
    }
  }
  if (outline > 0) {
    g.poly(left).stroke({ width: outline, color: pal.dark, alpha: 0.85, join: 'round' });
    g.poly(right).stroke({ width: outline, color: pal.dark, alpha: 0.85, join: 'round' });
  }
  const flags = stoneArt(pal, 'stoneTop');
  g.poly([...pt(x0, y0, top), ...pt(x1, y0, top), ...pt(x1, y1, top), ...pt(x0, y1, top)])
    .fill(flags ? paint(flags, stoneMatrix('top', top)) : pal.top)
    .stroke(outline > 0 ? { width: outline, color: pal.dark, alpha: 0.85, join: 'round' } : { width: 0.8, color: pal.dark, alpha: 0.35 });
}

/** Height of one course of blocks, in levels, and the length of a block, in tiles. */
const COURSE = 0.25;
const BLOCK = 0.2;

/**
 * Stone blocks on both visible faces: a mortar line under each course, staggered joints between
 * blocks, and a few blocks a shade lighter or darker, so walls read as built of stone.
 */
function drawBlocks(g: Graphics, b: Box, pal: Palette): void {
  const { x0, y0, x1, y1, base, top } = b;
  const mortar = { width: 0.8, color: pal.dark, alpha: 0.5 };
  const faces = [
    { from: x0, to: x1, at: (u: number, lv: number) => pt(u, y1, lv), lit: 1 },
    { from: y0, to: y1, at: (u: number, lv: number) => pt(x1, u, lv), lit: 0.78 },
  ];
  const first = Math.ceil((base + 0.01) / COURSE);
  for (const f of faces) {
    for (let c = first; c * COURSE < top - 0.05; c++) {
      const lo = c * COURSE;
      const hi = Math.min(top, lo + COURSE);
      const [ax, ay] = f.at(f.from, lo) as [number, number];
      const [bx, by] = f.at(f.to, lo) as [number, number];
      g.moveTo(ax, ay).lineTo(bx, by).stroke(mortar);
      // Joints, offset by half a block on every other course.
      const offset = c % 2 === 0 ? 0 : BLOCK / 2;
      for (let u = Math.floor(f.from / BLOCK) * BLOCK + offset; u < f.to; u += BLOCK) {
        if (u <= f.from + 0.02) continue;
        const [jx, jy] = f.at(u, lo) as [number, number];
        const [kx, ky] = f.at(u, hi) as [number, number];
        g.moveTo(jx, jy).lineTo(kx, ky).stroke(mortar);
        const h = hash2(Math.round(u * 50), c, 31);
        if (h < 0.18 || h > 0.9) {
          const u2 = Math.min(f.to, u + BLOCK);
          const quad = [...f.at(u, lo), ...f.at(u2, lo), ...f.at(u2, hi), ...f.at(u, hi)];
          g.poly(quad).fill({ color: shade(pal.face, f.lit * (h < 0.18 ? 0.86 : 1.12)), alpha: 0.9 });
        }
      }
    }
  }
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

/** A covered pot of oil on a hoist at the front corner of a piece's top. */
function drawCauldron(g: Graphics, x: number, y: number, top: number, pal: Palette): void {
  const [cx, cy] = pt(x + 0.32, y + 0.32, top + MERLON_H) as [number, number];
  g.moveTo(cx - 5, cy).lineTo(cx, cy - 9).lineTo(cx + 5, cy).stroke({ width: 1, color: 0x4a3a28 });
  g.ellipse(cx, cy - 2.5, 4, 3).fill(0x2b2622).stroke({ width: 0.6, color: pal.dark });
  g.ellipse(cx, cy - 4.5, 3, 1.1).fill(0x6b4a1a);
}

function drawSquareTower(g: Graphics, x: number, y: number, r: number, base: number, top: number, pal: Palette, finished: boolean, slits: boolean): void {
  const b: Box = { x0: x - r, y0: y - r, x1: x + r, y1: y + r, base, top };
  drawBox(g, b, pal, true);
  if (!finished) return;
  for (let lv = top - 1; slits && lv > base + 0.6; lv -= 1.4) {
    slit(g, b, 'left', x, lv - 0.3, 0.04, 0.55, pal.dark);
    slit(g, b, 'right', y, lv - 0.3, 0.04, 0.55, pal.dark);
  }
  drawMerlons(g, ringMerlons(b), pal);
}

function roundTop(pal: Palette, top: number) {
  const flags = stoneArt(pal, 'stoneTop');
  return flags ? paint(flags, stoneMatrix('top', top)) : pal.top;
}

function drawRoundTower(g: Graphics, x: number, y: number, r: number, base: number, top: number, pal: Palette, finished: boolean, slits: boolean): void {
  const { tileW, tileH } = viewAngle();
  const rx = (r * tileW) / Math.SQRT2;
  const ry = (r * tileH) / Math.SQRT2;
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
  const { masonry, outline } = style().castle;
  const face = stoneArt(pal, 'stoneFace');
  if (face) {
    // The drum in narrow strips, each with the texture laid along the curve and lit by how it faces the light (upper left).
    const n = 16;
    const u = (a: number) => r * (Math.PI - a) * STONE_TEXELS;
    const level0 = isoToScreen(x, y, 0).sy;
    for (let i = 0; i < n; i++) {
      const a0 = Math.PI * (1 - i / n);
      const a1 = Math.PI * (1 - (i + 1) / n);
      const du = u(a1) - u(a0);
      const ma = (rx * (Math.cos(a1) - Math.cos(a0))) / du;
      const mb = (ry * (Math.sin(a1) - Math.sin(a0))) / du;
      const m: [number, number, number, number, number, number] = [ma, mb, 0, 1, c0.sx + rx * Math.cos(a0) - u(a0) * ma, level0 + ry * Math.sin(a0) - u(a0) * mb];
      const mid = (a0 + a1) / 2;
      const light = 0.7 + 0.32 * Math.max(0, Math.cos(mid - 0.75 * Math.PI));
      g.poly(half(a0, a1)).fill(paint(face, m, light));
    }
  } else {
    g.poly(half(Math.PI, Math.PI / 2)).fill(shade(pal.face, 1));
    g.poly(half(Math.PI / 2, 0)).fill(shade(pal.face, SHADED));
  }
  if (masonry !== 'courses' && !face) {
    // Courses round the drum, with joints staggered course by course.
    const mortar = { width: 0.8, color: pal.dark, alpha: 0.5 };
    for (let c = Math.ceil((base + 0.01) / COURSE); c * COURSE < top - 0.05; c++) {
      const lo = isoToScreen(x, y, c * COURSE).sy;
      const hi = isoToScreen(x, y, Math.min(top, (c + 1) * COURSE)).sy;
      g.poly(arc(lo, 0, Math.PI), false).stroke(mortar);
      for (let i = c % 2 === 0 ? 1 : 0.5; i < 7; i++) {
        const a = (i / 7) * Math.PI;
        const jx = c0.sx + rx * Math.cos(a);
        g.moveTo(jx, lo + ry * Math.sin(a)).lineTo(jx, hi + ry * Math.sin(a)).stroke(mortar);
      }
    }
  }
  if (outline > 0) g.poly(half(Math.PI, 0)).stroke({ width: outline, color: pal.dark, alpha: 0.85, join: 'round' });
  if (!finished) {
    g.ellipse(c1.sx, c1.sy, rx, ry).fill(roundTop(pal, top)).stroke({ width: 0.8, color: pal.dark, alpha: 0.35 });
    return;
  }
  for (let lv = top - 1; slits && lv > base + 0.6; lv -= 1.4) {
    const s = isoToScreen(x, y, lv - 0.3);
    g.rect(s.sx - rx * 0.45 - 1.5, s.sy + ry * 0.85 - 9, 3, 9).fill(pal.dark);
    g.rect(s.sx + rx * 0.45 - 1.5, s.sy + ry * 0.85 - 9, 3, 9).fill(pal.dark);
  }
  g.ellipse(c1.sx, c1.sy, rx, ry).fill(roundTop(pal, top)).stroke({ width: 0.8, color: pal.dark, alpha: 0.35 });
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

function drawGatehouse(g: Graphics, x: number, y: number, axis: 'x' | 'y', base: number, top: number, pal: Palette, finished: boolean): void {
  const r = 0.47;
  const b: Box = { x0: x - r, y0: y - r, x1: x + r, y1: y + r, base, top };
  drawBox(g, b, pal, true);
  if (!finished && top < base + 2) return;
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
  if (!finished) return;
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

function drawKeep(g: Graphics, x: number, y: number, base: number, top: number, pal: Palette, finished: boolean): void {
  const inset = 0.08;
  const b: Box = { x0: x - 0.5 + inset, y0: y - 0.5 + inset, x1: x + 1.5 - inset, y1: y + 1.5 - inset, base, top };
  drawBox(g, b, pal, true);
  if (!finished) return;
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
  // A flagpole with a plain pennant (heraldry comes in M9).
  const [px, py] = pt(x + 0.5, y + 0.5, top) as [number, number];
  const poleTop = py - 46;
  g.moveTo(px, py).lineTo(px, poleTop).stroke({ width: 1.5, color: 0x3a2e22 });
  g.poly([px, poleTop, px + 20, poleTop + 5, px, poleTop + 10]).fill(style().castle.banner);
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
    const top = Math.max(...tiles.map(([x, y]) => heightAt(view.map, x, y))) + drawnLevels(pieceLevels(p), p.kind);
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
