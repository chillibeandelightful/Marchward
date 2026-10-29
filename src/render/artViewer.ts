import { Application, Container, Sprite, Text } from 'pixi.js';
import type { TerrainId } from '../data/terrain';
import { createPlan, placePieces, viewPlan, type PieceSpec } from '../sim/castle';
import type { TerrainMap } from '../sim/terrain';
import { ProceduralAssets, type SpriteName } from './assets';
import { CastleArt } from './castleArt';
import { setViewAngle, VIEWS, type ViewId } from './iso';
import { PaintedAssets, paintedCounts } from './paintedArt';
import { setStyle, type StyleId } from './styles';
import { buildTileShapes } from './tileGeometry';
import { TerrainView } from './terrainView';

/**
 * The art viewer (`?art` in the address): every sprite and its variants, then a small test plot with
 * a castle, in Painted and then Drab, so new art can be checked without playing.
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
