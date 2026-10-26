import { Application, Container } from 'pixi.js';
import { simConfig } from './data/config';
import { FixedStepLoop } from './sim/loop';
import { createSim, stepSim } from './sim/state';
import { ProceduralAssets } from './render/assets';
import { Camera } from './render/camera';
import { buildTileShapes, pickTile, type TileShape } from './render/tileGeometry';
import { TerrainView } from './render/terrainView';
import { CameraInput } from './ui/cameraInput';
import { Hud } from './ui/hud';

async function start(): Promise<void> {
  const host = document.getElementById('app');
  const statusEl = document.getElementById('hud');
  const readoutEl = document.getElementById('readout');
  if (!host || !statusEl || !readoutEl) throw new Error('Missing #app, #hud or #readout element');

  const app = new Application();
  await app.init({ resizeTo: host, background: 0x1b1f24, antialias: true });
  host.appendChild(app.canvas);

  // ?seed=123 in the URL reproduces a specific run.
  const seedParam = Number(new URLSearchParams(location.search).get('seed'));
  const sim = createSim(Number.isInteger(seedParam) && seedParam > 0 ? seedParam : simConfig.defaultSeed);
  const loop = new FixedStepLoop(1000 / simConfig.ticksPerSecond, () => stepSim(sim));

  const shapes = buildTileShapes(sim.map);
  const view = new TerrainView(sim.map, shapes, new ProceduralAssets(app.renderer));
  const world = new Container();
  world.addChild(view.root);
  app.stage.addChild(world);

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
    onToggleGrid: () => view.setGrid(!view.gridVisible),
  });
  const hud = new Hud(statusEl, readoutEl);

  let hovered: TileShape | null = null;
  app.ticker.add((ticker) => {
    loop.advance(ticker.deltaMS);
    input.update(ticker.deltaMS);
    const w = app.screen.width;
    const h = app.screen.height;
    world.scale.set(camera.zoom);
    world.position.set(w / 2 - camera.x * camera.zoom, h / 2 - camera.y * camera.zoom);

    const p = input.pointer;
    const wp = p ? camera.screenToWorld(p.x, p.y, w, h) : null;
    const next = wp ? pickTile(shapes, wp.x, wp.y) : null;
    if (next !== hovered) {
      hovered = next;
      view.setHover(hovered);
    }
    hud.update(sim, ticker.FPS, camera.zoom, hovered);
  });
}

start().catch((err: unknown) => {
  document.body.textContent = `Failed to start: ${String(err)}`;
});
