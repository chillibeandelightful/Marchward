import { Container, Graphics, Sprite } from 'pixi.js';
import { hash2 } from '../sim/noise';
import { heightAt, inBounds, stepBetween, terrainAt, type TerrainMap } from '../sim/terrain';
import type { SpriteAssets, SpriteName } from './assets';
import { isoToScreen, levelPx } from './iso';
import { surfaceLevel, type Face, type Pt, type TileShape } from './tileGeometry';
import { style } from './styles';
import { shade } from './terrainStyle';

interface Decor {
  name: SpriteName;
  u: number;
  v: number;
}

/** Things that stand on the land (castle pieces), drawn in with each diagonal row. */
export interface RowExtras {
  /** Hide the ground sprites (trees, stones) on this tile. */
  hidesDecor(x: number, y: number): boolean;
  /** Draw whatever stands on this diagonal row (x + y), after the row's ground and sprites. */
  drawRow(diagonal: number, g: Graphics): void;
}

/**
 * Draws the land from sim state. Each diagonal row of tiles gets one Graphics for the ground,
 * one container for the sprites standing on it and one Graphics for extras (castle pieces),
 * drawn back to front so nearer land and taller things overlap what is behind them.
 * Reads state; never changes it.
 */
export class TerrainView {
  readonly root = new Container();
  private readonly land = new Container();
  private readonly hover = new Graphics();
  private grid = false;
  private rows: { ground: Graphics; sprites: Container; extra: Graphics; actors: Graphics }[] = [];
  private usedActors = new Set<number>();
  private decor = new Map<number, Sprite[]>();

  constructor(
    private map: TerrainMap,
    private shapes: readonly TileShape[],
    private readonly assets: SpriteAssets,
    private readonly extras?: RowExtras,
  ) {
    this.root.addChild(this.land, this.hover);
    this.build();
  }

  get gridVisible(): boolean {
    return this.grid;
  }

  setGrid(on: boolean): void {
    if (on === this.grid) return;
    this.grid = on;
    this.build();
  }

  /** Redraw everything for changed land (after planned earthworks). */
  setLand(map: TerrainMap, shapes: readonly TileShape[]): void {
    this.map = map;
    this.shapes = shapes;
    this.build();
  }

  /** Redraw just some diagonal rows of changed land; much quicker than `setLand` for a few tiles. */
  updateRows(map: TerrainMap, shapes: readonly TileShape[], diagonals: Iterable<number>): void {
    this.map = map;
    this.shapes = shapes;
    for (const d of diagonals) {
      const row = this.rows[d];
      if (!row) continue;
      row.ground.clear();
      for (const child of row.sprites.removeChildren()) child.destroy();
      for (const s of shapes) {
        if (s.x + s.y !== d) continue;
        this.decor.delete(s.y * map.width + s.x);
        this.drawTile(row.ground, row.sprites, s);
      }
    }
    this.redrawExtras();
  }

  /** Redraw only the extras and which sprites they hide; much cheaper than a full rebuild. */
  redrawExtras(): void {
    if (!this.extras) return;
    this.rows.forEach((row, d) => {
      row.extra.clear();
      this.extras?.drawRow(d, row.extra);
    });
    for (const [i, sprites] of this.decor) {
      const hidden = this.extras.hidesDecor(i % this.map.width, Math.floor(i / this.map.width));
      for (const s of sprites) s.visible = !hidden;
    }
  }

  /** A layer drawn just after a row's pieces, for figures that move every frame. Cleared by `clearActors`. */
  actorsFor(diagonal: number): Graphics | undefined {
    const row = this.rows[diagonal];
    if (!row) return undefined;
    this.usedActors.add(diagonal);
    return row.actors;
  }

  /** The layers holding small things (trees, rocks, figures, fire) rather than ground and stone. */
  detailLayers(): Container[] {
    const out: Container[] = [this.hover];
    for (const r of this.rows) if (r) out.push(r.sprites, r.actors);
    return out;
  }

  clearActors(): void {
    for (const d of this.usedActors) this.rows[d]?.actors.clear();
    this.usedActors.clear();
  }

  setHover(shape: TileShape | null): void {
    const g = this.hover.clear();
    if (!shape) return;
    const colour = style().terrain.hover;
    g.poly(flat(shape.top)).fill({ color: colour, alpha: 0.18 }).stroke({ width: 2, color: colour });
  }

  private build(): void {
    for (const child of this.land.removeChildren()) child.destroy({ children: true });
    this.rows = [];
    this.usedActors.clear();
    this.decor.clear();
    let row: Graphics | null = null;
    let sprites: Container | null = null;
    let diagonal = -1;
    for (const s of this.shapes) {
      if (s.x + s.y !== diagonal) {
        diagonal = s.x + s.y;
        row = new Graphics();
        sprites = new Container();
        const extra = new Graphics();
        const actors = new Graphics();
        this.rows[diagonal] = { ground: row, sprites, extra, actors };
        this.land.addChild(row, sprites, extra, actors);
      }
      this.drawTile(row as Graphics, sprites as Container, s);
    }
    this.redrawExtras();
  }

  private drawTile(g: Graphics, sprites: Container, s: TileShape): void {
    const terrain = terrainAt(this.map, s.x, s.y);
    const pal = style().terrain;
    for (const f of s.faces) this.drawFace(g, f);

    // Light comes from the upper left of the screen (the -x side), so slopes rising
    // towards +x catch it and slopes rising towards +y are a little darker.
    const c = s.corners;
    const gx = (c.e + c.s - c.n - c.w) / 2;
    const gy = (c.s + c.w - c.n - c.e) / 2;
    const light = 1 + 0.4 * gx - 0.18 * gy + 0.05 * (s.level - 2) + (hash2(s.x, s.y, 7) - 0.5) * pal.grain;
    g.poly(flat(s.top)).fill(shade(pal.ground[terrain.id], light));
    if (pal.speckle && !terrain.water) this.drawSpeckle(g, s, pal.speckle, light);
    if (this.grid) g.poly(flat(s.top)).stroke({ width: 1, color: pal.grid, alpha: 0.35 });
    this.drawContours(g, s, terrain.water);

    switch (terrain.id) {
      case 'road':
        this.drawRoad(g, s);
        break;
      case 'marsh':
        for (let i = 0; i < 2; i++) {
          if (hash2(s.x, s.y, 20 + i) < 0.35) continue;
          const p = this.point(s, (hash2(s.x, s.y, 30 + i) - 0.5) * 0.5, (hash2(s.x, s.y, 40 + i) - 0.5) * 0.5);
          g.ellipse(p.x, p.y, 7, 3).fill({ color: pal.puddle, alpha: 0.85 });
        }
        break;
      case 'ford':
        this.drawRoad(g, s);
        break;
      case 'shallow':
      case 'deep': {
        const n = terrain.id === 'shallow' ? 2 : 1;
        for (let i = 0; i < n; i++) {
          if (hash2(s.x, s.y, 50 + i) < 0.4) continue;
          const p = this.point(s, (hash2(s.x, s.y, 60 + i) - 0.5) * 0.6, (hash2(s.x, s.y, 70 + i) - 0.5) * 0.6);
          g.moveTo(p.x - 6, p.y)
            .quadraticCurveTo(p.x, p.y - 2, p.x + 6, p.y)
            .stroke({ width: 1.2, color: pal.ripple, alpha: terrain.id === 'shallow' ? 0.55 : 0.3 });
        }
        break;
      }
    }

    for (const d of decorFor(terrain.id, s.x, s.y)) {
      const art = this.assets.get(d.name, Math.floor(hash2(s.x, s.y, 90 + d.u * 10) * 3));
      const p = this.point(s, d.u, d.v);
      const sprite = new Sprite(art.texture);
      sprite.anchor.set(art.anchorX, art.anchorY);
      sprite.position.set(p.x, p.y);
      sprites.addChild(sprite);
      const i = s.y * this.map.width + s.x;
      this.decor.set(i, [...(this.decor.get(i) ?? []), sprite]);
    }
  }

  /**
   * A faint line where this tile meets a neighbour one level lower or higher, like contour
   * lines on a map, so the height steps of a gentle hill can be counted. Drawn on the back
   * edges (the seams with already-drawn tiles) so this tile's own sprites stay on top.
   */
  private drawContours(g: Graphics, s: TileShape, water: boolean): void {
    if (water) return;
    const [n, e, , w] = s.top as [Pt, Pt, Pt, Pt];
    for (const [dx, dy, a, b] of [
      [0, -1, n, e],
      [-1, 0, w, n],
    ] as const) {
      const nx = s.x + dx;
      const ny = s.y + dy;
      if (!inBounds(this.map, nx, ny) || terrainAt(this.map, nx, ny).water) continue;
      if (stepBetween(s.level, heightAt(this.map, nx, ny)) !== 'slope') continue;
      g.moveTo(a.x, a.y).lineTo(b.x, b.y).stroke({ width: 1.5, color: style().terrain.contour, alpha: 0.35 });
    }
  }

  /** A few flecks of darker and lighter ground, placed by a hash so they never move. */
  private drawSpeckle(g: Graphics, s: TileShape, colours: { dark: number; light: number }, light: number): void {
    for (let i = 0; i < 5; i++) {
      if (hash2(s.x, s.y, 200 + i) < 0.3) continue;
      const p = this.point(s, (hash2(s.x, s.y, 210 + i) - 0.5) * 0.8, (hash2(s.x, s.y, 220 + i) - 0.5) * 0.8);
      const dark = hash2(s.x, s.y, 230 + i) < 0.6;
      const w = 2 + hash2(s.x, s.y, 240 + i) * 3;
      g.rect(p.x - w / 2, p.y - 1, w, 2).fill(shade(dark ? colours.dark : colours.light, light));
    }
  }

  private drawFace(g: Graphics, f: Face): void {
    const pal = style().terrain;
    const base = pal.face[f.kind];
    g.poly(flat(f.points)).fill(shade(base, f.side === 'left' ? 1 : 0.78));
    if (f.kind !== 'cliff') return;
    // Rock strata at each whole level, so the height of a cliff can be counted.
    const [a, b] = f.points as [Pt, Pt];
    const { topA, topB, bottomA, bottomB } = f.levels;
    for (let lv = Math.ceil(Math.max(bottomA, bottomB)); lv < Math.min(topA, topB); lv++) {
      if (lv <= Math.max(bottomA, bottomB)) continue;
      g.moveTo(a.x, a.y + (topA - lv) * levelPx())
        .lineTo(b.x, b.y + (topB - lv) * levelPx())
        .stroke({ width: 1, color: pal.strata, alpha: 0.8 });
    }
  }

  /** A road, or a line of stepping stones across a ford, joining neighbouring road and ford tiles. */
  private drawRoad(g: Graphics, s: TileShape): void {
    const links = ROAD_LINKS.filter(([dx, dy]) => {
      const nx = s.x + dx;
      const ny = s.y + dy;
      if (!inBounds(this.map, nx, ny)) return true; // roads run off the map edge
      const t = terrainAt(this.map, nx, ny).id;
      return t === 'road' || t === 'ford';
    });
    const centre = this.point(s, 0, 0);
    const ends = links.map(([dx, dy]) => this.point(s, dx / 2, dy / 2));

    if (terrainAt(this.map, s.x, s.y).id === 'ford') {
      for (const [dx, dy] of links)
        for (const t of [0.1, 0.32]) {
          const p = this.point(s, dx * t, dy * t);
          g.ellipse(p.x, p.y, 4, 2).fill(style().terrain.fordStone).stroke({ width: 0.8, color: 0x5a5244, alpha: 0.7 });
        }
      return;
    }

    const stroke = { width: 10, color: style().terrain.road, cap: 'round', join: 'round' } as const;
    const [a, b] = ends;
    const [la, lb] = links;
    const bend = links.length === 2 && la && lb && (la[0] !== -lb[0] || la[1] !== -lb[1]);
    if (a && b && bend) {
      // A corner: one curve instead of two straight legs, so the road doesn't zigzag.
      g.moveTo(a.x, a.y).quadraticCurveTo(centre.x, centre.y, b.x, b.y).stroke(stroke);
    } else if (ends.length === 0) {
      g.circle(centre.x, centre.y, 5).fill(stroke.color);
    } else {
      for (const e of ends) g.moveTo(centre.x, centre.y).lineTo(e.x, e.y).stroke(stroke);
    }
  }

  /** Screen point on the tile's surface at local offset (u, v). */
  private point(s: TileShape, u: number, v: number): { x: number; y: number } {
    const p = isoToScreen(s.x + u, s.y + v, surfaceLevel(s.corners, u, v));
    return { x: p.sx, y: p.sy };
  }
}

const ROAD_LINKS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const;

/** Sprites standing on a tile, sorted back to front. Positions come from a hash, so they never change. */
function decorFor(id: string, x: number, y: number): Decor[] {
  const out: Decor[] = [];
  const jitter = (salt: number) => (hash2(x, y, salt) - 0.5) * 0.16;
  switch (id) {
    case 'forest': {
      const spots = [
        [-0.22, -0.22],
        [0.22, -0.1],
        [-0.1, 0.22],
        [0.2, 0.25],
      ];
      spots.forEach(([u = 0, v = 0], i) => {
        if (i === 3 && hash2(x, y, 100) < 0.5) return;
        out.push({ name: hash2(x, y, 110 + i) < 0.65 ? 'pine' : 'oak', u: u + jitter(120 + i), v: v + jitter(130 + i) });
      });
      break;
    }
    case 'rock':
      if (hash2(x, y, 140) < 0.45) out.push({ name: 'boulder', u: jitter(141) * 2, v: jitter(142) * 2 });
      if (hash2(x, y, 143) < 0.5) out.push({ name: 'stones', u: 0.2 + jitter(144), v: -0.15 + jitter(145) });
      break;
    case 'marsh':
      if (hash2(x, y, 150) < 0.7) out.push({ name: 'reeds', u: -0.2 + jitter(151), v: 0.1 + jitter(152) });
      if (hash2(x, y, 153) < 0.4) out.push({ name: 'reeds', u: 0.2 + jitter(154), v: -0.2 + jitter(155) });
      break;
    case 'grass':
      if (hash2(x, y, 160) < 0.35) out.push({ name: 'tuft', u: jitter(161) * 3, v: jitter(162) * 3 });
      break;
  }
  return out.sort((a, b) => a.u + a.v - (b.u + b.v));
}

function flat(pts: readonly { x: number; y: number }[]): number[] {
  return pts.flatMap((p) => [p.x, p.y]);
}
