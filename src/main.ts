import { Application, Container, Graphics } from 'pixi.js';
import { simConfig } from './data/config';
import { pieceAt, pieceLevels, planReport, viewPlan, type PlanReport, type PlanView } from './sim/castle';
import { FixedStepLoop } from './sim/loop';
import { createSim, stepSim } from './sim/state';
import { inBounds } from './sim/terrain';
import { ProceduralAssets } from './render/assets';
import { Camera } from './render/camera';
import { CastleArt, pickPiece } from './render/castleArt';
import { isoToScreen } from './render/iso';
import { buildTileShape, buildTileShapes, pickTile, type TileShape } from './render/tileGeometry';
import { TerrainView } from './render/terrainView';
import { CameraInput } from './ui/cameraInput';
import { Designer } from './ui/designer';
import { Hud } from './ui/hud';

async function start(): Promise<void> {
  const host = document.getElementById('app');
  const statusEl = document.getElementById('hud');
  const readoutEl = document.getElementById('readout');
  const toolsEl = document.getElementById('tools');
  const panelEl = document.getElementById('panel');
  if (!host || !statusEl || !readoutEl || !toolsEl || !panelEl) throw new Error('Missing page elements');

  const app = new Application();
  await app.init({ resizeTo: host, background: 0x1b1f24, antialias: true });
  host.appendChild(app.canvas);

  // ?seed=123 in the URL reproduces a specific run.
  const seedParam = Number(new URLSearchParams(location.search).get('seed'));
  const sim = createSim(Number.isInteger(seedParam) && seedParam > 0 ? seedParam : simConfig.defaultSeed);
  const loop = new FixedStepLoop(1000 / simConfig.ticksPerSecond, () => stepSim(sim));

  // The designer shows the land as it will be after the planned earthworks.
  let view: PlanView = viewPlan(sim.map, sim.plan);
  let report: PlanReport = planReport(sim.map, view);
  let shapes = buildTileShapes(view.map);
  const shapeIndex = (list: readonly TileShape[]) => {
    const out: TileShape[] = [];
    for (const s of list) out[s.y * sim.map.width + s.x] = s;
    return out;
  };
  let shapeAt = shapeIndex(shapes);
  const art = new CastleArt(view);
  art.setShapes((x, y) => shapeAt[y * sim.map.width + x]);
  art.setView(view, new Set());
  const terrain = new TerrainView(view.map, shapes, new ProceduralAssets(app.renderer), art);
  const ghosts = new Graphics();
  const world = new Container();
  world.addChild(terrain.root, ghosts);
  app.stage.addChild(world);


  const designer = new Designer(
    {
      base: sim.map,
      plan: sim.plan,
      view: () => view,
      report: () => report,
      changed(land) {
        view = viewPlan(sim.map, sim.plan);
        report = planReport(sim.map, view);
        art.setView(view, new Set(report.problems.map((p) => p.piece.id)));
        if (land === 'all') {
          shapes = buildTileShapes(view.map);
          shapeAt = shapeIndex(shapes);
          terrain.setLand(view.map, shapes);
        } else if (land.length > 0) {
          // A tile's shape depends on its neighbours' heights out to two tiles away.
          const rows = new Set<number>();
          const list = [...shapes];
          for (const t of land)
            for (let dy = -2; dy <= 2; dy++)
              for (let dx = -2; dx <= 2; dx++) {
                const x = t.x + dx;
                const y = t.y + dy;
                const i = y * sim.map.width + x;
                const old = shapeAt[i];
                if (!old || !inBounds(view.map, x, y)) continue;
                const fresh = buildTileShape(view.map, x, y);
                list[shapes.indexOf(old)] = fresh;
                shapeAt[i] = fresh;
                rows.add(x + y);
              }
          shapes = list;
          terrain.updateRows(view.map, shapes, rows);
        } else {
          terrain.redrawExtras();
        }
      },
    },
    toolsEl,
    panelEl,
  );

  const minX = Math.min(...shapes.map((s) => s.minX));
  const minY = Math.min(...shapes.map((s) => s.minY));
  const maxX = Math.max(...shapes.map((s) => s.maxX));
  const maxY = Math.max(...shapes.map((s) => s.maxY));
  // Allow zooming out until the whole site fits, but no further.
  const fit = Math.min(app.screen.width / (maxX - minX), app.screen.height / (maxY - minY)) * 0.95;
  const camera = new Camera(Math.min(0.3, fit), 3);
  camera.setBounds(minX, minY, maxX, maxY);
  const home = () => {
    camera.zoom = Math.max(camera.minZoom, Math.min(0.75, fit * 1.6));
    camera.centreOn((minX + maxX) / 2, (minY + maxY) / 2);
  };
  home();

  const input = new CameraInput(app.canvas, camera, {
    onHome: home,
    onToggleGrid: () => terrain.setGrid(!terrain.gridVisible),
    canPan: (e) => !designer.wantsPress(e.button),
  });
  const hud = new Hud(statusEl, readoutEl);

  let hovered: TileShape | null = null;
  app.canvas.addEventListener('pointerdown', (e) => {
    if (!designer.wantsPress(e.button)) return;
    app.canvas.setPointerCapture(e.pointerId);
    designer.press(hovered);
  });
  const release = () => designer.release();
  app.canvas.addEventListener('pointerup', release);
  app.canvas.addEventListener('pointercancel', release);

  if (import.meta.env.DEV) {
    // For automated screenshots in development: where a tile's centre is on screen.
    (window as unknown as Record<string, unknown>).__marchward = {
      tileToScreen(x: number, y: number) {
        const s = shapeAt[y * sim.map.width + x];
        if (!s) return null;
        const c = s.corners;
        const piece = pieceAt(view, x, y);
        const p = isoToScreen(x, y, (c.n + c.e + c.s + c.w) / 4 + (piece ? pieceLevels(piece) : 0));
        return camera.worldToScreen(p.sx, p.sy, app.screen.width, app.screen.height);
      },
      camera,
      sim,
    };
  }

  let ghostKey = '';
  app.ticker.add((ticker) => {
    loop.advance(ticker.deltaMS);
    input.update(ticker.deltaMS);
    const w = app.screen.width;
    const h = app.screen.height;
    world.scale.set(camera.zoom);
    world.position.set(w / 2 - camera.x * camera.zoom, h / 2 - camera.y * camera.zoom);

    const p = input.pointer;
    const wp = p ? camera.screenToWorld(p.x, p.y, w, h) : null;
    const ground = wp ? pickTile(shapes, wp.x, wp.y) : null;
    // Pointing at a wall or tower means that piece's tile, not the ground behind it.
    const piece =
      wp && ground && designer.tool !== 'raise' && designer.tool !== 'lower'
        ? pickPiece(view, wp.x, wp.y, ground.x + ground.y)
        : null;
    const next = piece ? (shapeAt[piece.y * sim.map.width + piece.x] ?? ground) : ground;
    if (next !== hovered) {
      hovered = next;
      terrain.setHover(hovered);
    }
    designer.setHover(hovered ? { x: hovered.x, y: hovered.y } : null);

    const preview = designer.preview();
    const key = JSON.stringify([preview?.specs, preview?.check.problems, sim.plan.pieces.length, report.cost]);
    if (key !== ghostKey) {
      ghostKey = key;
      ghosts.clear();
      if (preview) {
        art.previewTiles = new Set(preview.specs.map((s) => `${s.x},${s.y}`));
        art.drawGhosts(ghosts, preview.specs, preview.check.problems);
      }
    }

    hud.update(sim, view.map, ticker.FPS, camera.zoom, hovered, designer.hoverLines());
    designer.updatePanel();
  });
}

start().catch((err: unknown) => {
  document.body.textContent = `Failed to start: ${String(err)}`;
});
