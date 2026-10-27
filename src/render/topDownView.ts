import { Container, Graphics } from 'pixi.js';
import { KEEP, WALL_THICKNESS } from '../data/castle';
import type { BattleState } from '../sim/battle';
import { footprint, isCurtain, linked, pieceAt, type Piece, type PieceSpec, type PlanView } from '../sim/castle';
import type { Post } from '../sim/defence';
import { heightAt, NEIGHBOURS, stepBetween, terrainAt, type TerrainMap } from '../sim/terrain';
import { tinted } from './castleArt';
import { foundationOutline } from './foundation';
import { style, type Palette } from './styles';
import { shade } from './terrainStyle';
import { PLAN_TILE as T } from './topDown';

const CLIFF_LINE = 0x1e1a14;
const RUBBLE = 0x7d6f5a;
const CAMP = 0x8a6a42;
// Same tints as the isometric castle art uses for problems and placement previews.
const BAD_TINT = 0xd8452f;
const GOOD_TINT = 0x8fe08a;
const CAULDRON = 0xe0802a;

/** What the top-down view draws each frame, besides the land and pieces. */
export interface PlanOverlay {
  hover: { x: number; y: number } | null;
  ghosts: { specs: readonly PieceSpec[]; problems: readonly (string | null)[] } | null;
  /** Troops' posts, shown outside battle. */
  posts: readonly Post[];
  /** While raiders wait to attack: everyone on the field. */
  battle: BattleState | null;
  camp: readonly [number, number];
}

/**
 * The flat plan of the site, seen from straight above: land coloured by terrain and shaded by
 * height, cliffs as heavy lines, pieces as their footprints. Reads state; never changes it.
 */
export class TopDownView {
  readonly root = new Container();
  private readonly land = new Graphics();
  private readonly pieces = new Graphics();
  private readonly overlay = new Graphics();
  private grid = true;
  /** Tiles of the planned curtain, so previewed walls join up with it. */
  private curtain: ReadonlySet<string> = new Set();

  constructor() {
    this.root.addChild(this.land, this.pieces, this.overlay);
  }

  setGrid(on: boolean): void {
    this.grid = on;
  }

  /** Redraw the land. */
  setLand(map: TerrainMap): void {
    const g = this.land.clear();
    const c = style().terrain;
    for (let y = 0; y < map.height; y++)
      for (let x = 0; x < map.width; x++) {
        const t = terrainAt(map, x, y);
        const base = t.id === 'road' ? c.road : c.ground[t.id];
        g.rect(x * T, y * T, T, T).fill(t.water ? base : shade(base, 0.78 + heightAt(map, x, y) * 0.07));
      }
    if (this.grid) {
      for (let x = 0; x <= map.width; x++) g.moveTo(x * T, 0).lineTo(x * T, map.height * T);
      for (let y = 0; y <= map.height; y++) g.moveTo(0, y * T).lineTo(map.width * T, y * T);
      g.stroke({ width: 1, color: c.grid, alpha: 0.18 });
    }
    // Where heights change: a thin contour for a slope, a heavy line for a cliff.
    for (const cliff of [false, true]) {
      for (let y = 0; y < map.height; y++)
        for (let x = 0; x < map.width; x++) {
          const h = heightAt(map, x, y);
          if (x + 1 < map.width) {
            const s = stepBetween(h, heightAt(map, x + 1, y));
            if (s !== 'flat' && (s === 'cliff') === cliff) g.moveTo((x + 1) * T, y * T).lineTo((x + 1) * T, (y + 1) * T);
          }
          if (y + 1 < map.height) {
            const s = stepBetween(h, heightAt(map, x, y + 1));
            if (s !== 'flat' && (s === 'cliff') === cliff) g.moveTo(x * T, (y + 1) * T).lineTo((x + 1) * T, (y + 1) * T);
          }
        }
      g.stroke(cliff ? { width: 3, color: CLIFF_LINE, alpha: 0.85 } : { width: 1, color: c.contour, alpha: 0.6 });
    }
  }

  /** Redraw the castle pieces: built in stone, the footings of planned ones marked out, problems in red. */
  setPieces(view: PlanView, problems: ReadonlySet<number>, progress: (p: Piece) => number, rubble: (p: Piece) => boolean): void {
    const g = this.pieces.clear();
    const { stone, planned } = style().castle;
    const problem = tinted(stone, BAD_TINT, 0.45);
    const curtain = new Set(view.plan.pieces.filter((p) => isCurtain(p.kind)).map((p) => `${p.x},${p.y}`));
    this.curtain = curtain;
    for (const p of view.plan.pieces) {
      if (rubble(p)) {
        for (const [x, y] of footprint(p)) g.rect(x * T + 3, y * T + 3, T - 6, T - 6).fill({ color: RUBBLE, alpha: 0.8 });
        continue;
      }
      const done = progress(p);
      if (done >= 1) drawPiece(g, view.map, curtain, p, problems.has(p.id) ? problem : stone, 1);
      else {
        if (done > 0) drawPiece(g, view.map, curtain, p, stone, done);
        drawFoundation(g, view, p, problems.has(p.id) ? BAD_TINT : planned.top, planned.dark);
      }
    }
  }

  /** Redraw what changes from frame to frame: hover, previews, troops. */
  setOverlay(o: PlanOverlay, map: TerrainMap): void {
    const g = this.overlay.clear();
    const { terrain, castle, figures } = style();
    const [cx, cy] = o.camp;
    g.rect((cx - 1) * T, (cy - 1) * T, 3 * T, 3 * T).stroke({ width: 2, color: CAMP, alpha: 0.9 });

    if (o.ghosts) {
      const curtain = new Set([...this.curtain, ...o.ghosts.specs.filter((s) => isCurtain(s.kind)).map((s) => `${s.x},${s.y}`)]);
      const ok = tinted(castle.stone, GOOD_TINT, 0.35);
      const bad = tinted(castle.stone, BAD_TINT, 0.55);
      o.ghosts.specs.forEach((s, i) => drawPiece(g, map, curtain, s, o.ghosts?.problems[i] ? bad : ok, 1, 0.8));
    }

    if (o.battle) {
      for (const u of o.battle.units) drawTroop(g, u.x + u.ox, u.y + u.oy, u.side === 'defender' ? figures.tabard : figures.raider, u.type === 'archer' || u.type === 'raiderArcher');
    } else {
      // Several soldiers on one tile are spread out so each can be seen.
      const seen = new Map<string, number>();
      for (const p of o.posts) {
        const key = `${p.x},${p.y}`;
        const n = seen.get(key) ?? 0;
        seen.set(key, n + 1);
        const a = n * 2.4;
        const r = n === 0 ? 0 : 0.22;
        drawTroop(g, p.x + Math.cos(a) * r, p.y + Math.sin(a) * r, figures.tabard, p.type === 'archer');
      }
    }

    if (o.hover) g.rect(o.hover.x * T, o.hover.y * T, T, T).stroke({ width: 2, color: terrain.hover, alpha: 0.95 });
  }
}

/** The outline of a planned piece's footings. */
function drawFoundation(g: Graphics, view: PlanView, p: Piece, colour: number, shadow: number): void {
  const { segments, circles } = foundationOutline(p, (nx, ny) => {
    const o = pieceAt(view, nx, ny);
    if (!o || o.kind === 'keep' || !linked(view, p.x, p.y, nx, ny)) return null;
    return o.kind === 'tower' && o.shape === 'round' ? 'round-tower' : o.kind;
  });
  const c = (v: number) => (v + 0.5) * T;
  for (const [width, color, alpha] of [
    [4, shadow, 0.35],
    [2, colour, 0.95],
  ] as const) {
    for (const [x0, y0, x1, y1] of segments) g.moveTo(c(x0), c(y0)).lineTo(c(x1), c(y1));
    for (const k of circles) g.circle(c(k.x), c(k.y), k.r * T);
    g.stroke({ width, color, alpha, cap: 'round', join: 'round' });
  }
}

/** A soldier as a counter: round for archers, square for swordsmen and axemen. */
function drawTroop(g: Graphics, x: number, y: number, colour: number, archer: boolean): void {
  const cx = (x + 0.5) * T;
  const cy = (y + 0.5) * T;
  const r = T * 0.2;
  if (archer) g.circle(cx, cy, r);
  else g.rect(cx - r, cy - r, r * 2, r * 2);
  g.fill(colour).stroke({ width: 1.5, color: 0xf2ead8 });
}

/**
 * A piece's footprint from above. Walls run as a band to each joined neighbour in `curtain`;
 * `share` under 1 draws a smaller inner block, for a piece part built.
 */
function drawPiece(g: Graphics, map: TerrainMap, curtain: ReadonlySet<string>, p: PieceSpec, pal: Palette, share: number, alpha = 1): void {
  const k = Math.max(0.25, share);
  const fill = { color: pal.top, alpha };
  const line = { width: 1.5, color: pal.dark, alpha: 0.8 * alpha };
  const x0 = p.x * T;
  const y0 = p.y * T;
  const mid = (w: number) => (T * (1 - w * k)) / 2;
  switch (p.kind) {
    case 'wall': {
      const w = WALL_THICKNESS[p.thickness].width * k;
      const hw = (T * w) / 2;
      const cx = x0 + T / 2;
      const cy = y0 + T / 2;
      g.rect(cx - hw, cy - hw, hw * 2, hw * 2);
      for (const [dx, dy] of NEIGHBOURS) {
        const nx = p.x + dx;
        const ny = p.y + dy;
        if (!curtain.has(`${nx},${ny}`) || stepBetween(heightAt(map, p.x, p.y), heightAt(map, nx, ny)) === 'cliff') continue;
        if (dx !== 0) g.rect(dx > 0 ? cx : cx - T / 2, cy - hw, T / 2, hw * 2);
        else g.rect(cx - hw, dy > 0 ? cy : cy - T / 2, hw * 2, T / 2);
      }
      g.fill(fill);
      break;
    }
    case 'tower': {
      const r = T * 0.42 * k;
      if (p.shape === 'round') g.circle(x0 + T / 2, y0 + T / 2, r);
      else g.rect(x0 + T / 2 - r, y0 + T / 2 - r, r * 2, r * 2);
      g.fill(fill).stroke(line);
      break;
    }
    case 'gatehouse': {
      const m = mid(0.9);
      g.rect(x0 + m, y0 + m, T - 2 * m, T - 2 * m).fill(fill).stroke(line);
      // The passage through it.
      const pw = T * 0.22;
      if (p.axis === 'x') g.rect(x0, y0 + T / 2 - pw / 2, T, pw);
      else g.rect(x0 + T / 2 - pw / 2, y0, pw, T);
      g.fill({ color: pal.dark, alpha: 0.75 * alpha });
      break;
    }
    case 'keep': {
      const s = KEEP.size * T;
      const m = (s * (1 - 0.9 * k)) / 2;
      g.rect(x0 + m, y0 + m, s - 2 * m, s - 2 * m).fill(fill).stroke(line);
      if (share >= 1) {
        const r = T * 0.22;
        for (const [cx, cy] of [
          [x0 + m, y0 + m],
          [x0 + s - m, y0 + m],
          [x0 + m, y0 + s - m],
          [x0 + s - m, y0 + s - m],
        ] as const)
          g.circle(cx, cy, r).fill(fill).stroke(line);
      }
      break;
    }
  }
  if (share >= 1 && p.cauldron) g.circle(x0 + T / 2, y0 + T / 2, T * 0.09).fill(CAULDRON);
}
