import { Application, Container, Graphics, Sprite, Text, TilingSprite } from 'pixi.js';
import type { TerrainId } from '../data/terrain';
import { createPlan, placePieces, viewPlan, type PieceSpec } from '../sim/castle';
import type { TerrainMap } from '../sim/terrain';
import { ProceduralAssets, type SpriteName } from './assets';
import { CastleArt } from './castleArt';
import { flames, smokeColumn } from './effectsArt';
import { setViewAngle, VIEWS, type ViewId } from './iso';
import { WORKER_TYPES } from '../data/economy';
import { UNITS, type UnitType } from '../data/combat';
import { PaintedAssets, paintedCounts, paintedFrames, paintedTexture, POSES, type ArtName } from './paintedArt';
import { setStyle, type StyleId } from './styles';
import { buildTileShapes } from './tileGeometry';
import { TerrainView } from './terrainView';

/**
 * The art viewer (`?art` in the address): every sprite and its variants, then a small test plot with
 * a castle, in Painted and then Drab, so new art can be checked without playing. Below the plants come
 * the people in each pose (frames left to right), the camp and effects, and the ground textures.
 * `&view=low|high|standard` picks the camera angle (Low by default).
 */

const NAMES: readonly SpriteName[] = ['pine', 'oak', 'boulder', 'stones', 'reeds', 'tuft'];
const SIZE = 14;

/** A flat test plot: grass, with a strip of forest, rock and marsh along the back for the decor. */
function testPlot(): TerrainMap {
  const types: TerrainId[] = [];
  for (let y = 0; y < SIZE; y++)
    for (let x = 0; x < SIZE; x++) types.push(y < 2 ? 'forest' : x < 2 ? (y < 8 ? 'rock' : 'marsh') : x === SIZE - 1 ? 'road' : 'grass');
  return { width: SIZE, height: SIZE, heights: new Array<number>(SIZE * SIZE).fill(2), types };
}

const CASTLE: PieceSpec[] = [
  ...[4, 5, 6, 7, 8].map((x): PieceSpec => ({ kind: 'wall', x, y: 4, thickness: 'standard', height: 'medium' })),
  ...[5, 6, 7, 8].map((y): PieceSpec => ({ kind: 'wall', x: 3, y, thickness: 'standard', height: 'medium' })),
  { kind: 'tower', x: 3, y: 4, shape: 'square', height: 'medium' },
  { kind: 'tower', x: 9, y: 4, shape: 'round', height: 'high' },
  { kind: 'tower', x: 3, y: 9, shape: 'round', height: 'medium' },
  { kind: 'gatehouse', x: 3, y: 10, axis: 'y' },
  { kind: 'keep', x: 6, y: 7 },
  ...[4, 5, 6].map((x): PieceSpec => ({ kind: 'wall', x, y: 11, thickness: 'thick', height: 'high' })),
  ...[9, 10, 11].map((x): PieceSpec => ({ kind: 'wall', x, y: 10, thickness: 'thin', height: 'low' })),
];

function plotFor(id: StyleId, app: Application): Container {
  setStyle(id);
  const map = testPlot();
  const plan = createPlan(map);
  placePieces(map, plan, CASTLE);
  const view = viewPlan(map, plan);
  const art = new CastleArt(view);
  // The last thin wall is shown part built, with scaffolding.
  const halfBuilt = plan.pieces[plan.pieces.length - 1]?.id;
  art.setProgress((p) => (p.id === halfBuilt ? 0.5 : 1));
  const terrain = new TerrainView(map, buildTileShapes(map), new PaintedAssets(new ProceduralAssets(app.renderer)), art);
  return terrain.root;
}

function label(text: string, x: number, y: number): Text {
  const t = new Text({ text, style: { fill: 0xe8e2d0, fontSize: 14, fontFamily: 'Pixelify Sans, monospace' } });
  t.position.set(x, y);
  return t;
}

export function showArtViewer(app: Application): void {
  const viewParam = new URLSearchParams(location.search).get('view');
  const viewId: ViewId = viewParam === 'high' || viewParam === 'standard' ? viewParam : 'low';
  setViewAngle(viewId);
  document.body.classList.remove('classic');
  // Only the canvas: the game's bars and panels aren't wanted here.
  for (const el of document.body.querySelectorAll<HTMLElement>('body > *:not(#app)')) el.style.display = 'none';
  app.renderer.background.color = 0x3a3d2c;
  const page = new Container();
  app.stage.addChild(page);
  const counts = paintedCounts();

  // Sprites: the painted variants, then the Drab drawings they replace, at 3× size.
  const scale = 3;
  let y = 10;
  page.addChild(label(`Art viewer · ${VIEWS[viewId].name} · painted sprites (left) and the Drab drawings they replace (right)`, 10, y));
  y += 30;
  const fallback = new ProceduralAssets(app.renderer);
  const painted = new PaintedAssets(fallback);
  for (const name of NAMES) {
    page.addChild(label(`${name} (${counts[name] ?? 0} painted)`, 10, y));
    let x = 150;
    let rowH = 0;
    const show = (id: StyleId, n: number) => {
      setStyle(id);
      for (let v = 0; v < n; v++) {
        const art = (id === 'painted' ? painted : fallback).get(name, v);
        const s = new Sprite(art.texture);
        s.scale.set(scale);
        s.position.set(x, y);
        page.addChild(s);
        x += s.width + 12;
        rowH = Math.max(rowH, s.height);
      }
    };
    show('painted', Math.max(1, counts[name] ?? 0));
    x += 40;
    show('drab', 3);
    y += rowH + 16;
  }

  // People, the camp and effects: every frame, left to right, at 3× size.
  setStyle('painted');
  const frames = (name: ArtName, x0: number): number => {
    const list = paintedFrames(name) ?? [];
    let x = x0;
    for (const art of list) {
      const s = new Sprite(art.texture);
      s.scale.set(scale);
      s.position.set(x, y);
      page.addChild(s);
      x += s.width + 6;
    }
    return x;
  };
  const kinds = [...WORKER_TYPES, ...(Object.keys(UNITS) as UnitType[])];
  page.addChild(label('People: each pose, frames left to right', 10, y));
  y += 24;
  for (const kind of kinds) {
    page.addChild(label(kind, 10, y + 20));
    let x = 150;
    for (const pose of POSES) if (paintedFrames(`${kind}.${pose}`)) x = frames(`${kind}.${pose}`, x) + 30;
    y += 23 * scale + 10;
  }
  page.addChild(label('Camp and effects', 10, y));
  y += 24;
  let x = 10;
  for (const name of ['tent', 'block', 'log', 'cart', 'cartLoaded', 'fire', 'puff'] as const) x = frames(name, x) + 30;
  y += 30 * scale + 16;
  // The effects as the game draws them: small and big flames, then light and thick smoke, at 2×.
  page.addChild(label('Flames and smoke as drawn in the game (2×), animated', 10, y));
  y += 24;
  const fx = new Graphics();
  fx.position.set(10, y + 170);
  fx.scale.set(2);
  page.addChild(fx);
  app.ticker.add(() => {
    const t = performance.now() / 1000;
    fx.clear();
    flames(fx, 20, 70, t, 10, 1);
    flames(fx, 70, 70, t, 22, 2);
    smokeColumn(fx, 140, 70, t, 0.2, 3, 0x6a655c);
    smokeColumn(fx, 230, 70, t, 1, 4, 0x3c3a36);
  });
  y += 330;
  page.addChild(label('Ground textures, repeated (grass, forest, marsh, rock, shallow, ford, deep)', 10, y));
  y += 24;
  x = 10;
  for (const land of ['grass', 'forest', 'marsh', 'rock', 'shallow', 'ford', 'deep'] as const) {
    const tex = paintedTexture(`ground.${land}`);
    if (!tex) continue;
    const t = new TilingSprite({ texture: tex, width: 128, height: 128 });
    t.scale.set(1.5);
    t.position.set(x, y);
    page.addChild(t);
    x += 128 * 1.5 + 10;
  }
  y += 128 * 1.5 + 20;

  // The test plot in both styles.
  page.addChild(label('Test plot: Painted (top) and Drab (below). The thin wall on the right is half built.', 10, y));
  y += 24;
  for (const id of ['painted', 'drab'] as const) {
    const plot = plotFor(id, app);
    plot.scale.set(1.5);
    const b = plot.getBounds();
    plot.position.set(10 - b.x, y - b.y);
    page.addChild(plot);
    y += b.height + 20;
  }
  setStyle('painted');
  // Scroll with the mouse wheel when the page is taller than the window.
  app.canvas.addEventListener('wheel', (e) => {
    page.y = Math.min(0, page.y - e.deltaY);
  });
}
